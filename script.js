/* ==========================================================================
   RVELLARVELL WATCHES — app logic (no libraries)
   Data lives in products.js. Email is sent by the serverless endpoint.
   ========================================================================== */
(() => {
  "use strict";

  const cfg = STORE_CONFIG;
  const MAX_QTY = 20;
  const STORE_KEY = "rv_session_v1";     // sessionStorage: cart + current order only (cleared on reset)
  const DAILY_KEY = "rv_daily_v1";       // localStorage: counters only (no personal data)
  const app = document.getElementById("app");

  const INDIAN_STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];

  const UPI_STATUS = "Marked as completed — staff verification required";
  const NOTIFY_FAIL_MSG = "Your order has been recorded, but automatic shop notification failed. Please ask staff to confirm the order.";

  /* ------------------------------ State ------------------------------ */
  const emptyForm = () => ({ name: "", phone: "", address: "", city: "", state: "", pin: "", email: "" });

  const state = {
    cart: [],              // [{ id, qty }]
    form: emptyForm(),     // kept in memory only — never written to storage
    payment: null,         // "cod" | "upi"
    order: null,           // finished order snapshot
    notify: "idle",        // idle | pending | sent | failed
    submitting: false,     // duplicate-submission guard
    notifying: false
  };

  const timers = { hero: null, idle: null, idleWarn: null, idleTick: null, toast: null };

  function persist() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, order: state.order, notify: state.notify }));
    } catch (e) { /* storage unavailable — app still works in memory */ }
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      state.cart = Array.isArray(s.cart) ? s.cart.filter(l => getProduct(l.id) && l.qty > 0) : [];
      state.order = s.order || null;
      state.notify = s.notify === "pending" ? "failed" : (s.notify || "idle"); // interrupted send = treat as failed
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------ Helpers ------------------------------ */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
  const priceHtml = (p, cls = "") => p.price > 0
    ? `<p class="price ${cls}">${money(p.price)}</p>`
    : `<p class="price unset ${cls}">[ADD PRICE]</p>`;
  const getProduct = (id) => products.find(p => p.id === id);
  const cartCount = () => state.cart.reduce((n, l) => n + l.qty, 0);
  const cartLines = () => state.cart.map(l => ({ p: getProduct(l.id), qty: l.qty })).filter(l => l.p);
  const cartTotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(timers.toast);
    timers.toast = setTimeout(() => el.classList.remove("show"), 1700);
  }

  function updateBadge(bump) {
    const b = document.getElementById("cart-badge");
    const n = cartCount();
    b.textContent = n;
    b.hidden = n === 0;
    document.querySelector(".cart-link").setAttribute("aria-label", `Cart, ${n} item${n === 1 ? "" : "s"}`);
    if (bump) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }

  function randomInt(max) {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  /* ------------------------------ IDs ------------------------------ */
  // Counters only (no customer data) live in localStorage so IDs stay unique across customers.
  function dailyState(dateKey) {
    let d = { date: dateKey, seq: 0, used: [] };
    try {
      const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
      if (raw && raw.date === dateKey) d = raw;
    } catch (e) { /* ignore */ }
    return d;
  }
  function generateIds(now) {
    const dateKey = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const d = dailyState(dateKey);
    let suffix;
    let guard = 0;
    do { suffix = pad(randomInt(10000), 4); guard++; } while (d.used.includes(suffix) && guard < 200);
    d.used.push(suffix);
    d.seq += 1;
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
    return {
      orderId: `RVW-${dateKey}-${suffix}`,
      invoiceNo: `INV-${dateKey}-${pad(d.seq, 4)}`
    };
  }

  /* ------------------------------ Routing ------------------------------ */
  function parseHash() {
    const h = (location.hash || "#/home").replace(/^#\/?/, "");
    const [route, ...rest] = h.split("/");
    return [route || "home", decodeURIComponent(rest.join("/"))];
  }
  function navigate(route) {
    const target = "#/" + route;
    if (location.hash === target) render(); else location.hash = target;
  }

  function render() {
    clearInterval(timers.hero);
    let [route, arg] = parseHash();

    // Guards
    if (state.order && ["checkout", "payment", "cart"].includes(route)) route = "success";
    if (!state.order && ["success", "invoice"].includes(route)) route = "home";
    if (["checkout", "payment"].includes(route) && cartLines().length === 0) route = "cart";
    if (route === "payment" && !(state.payment === "upi" && validateForm(true))) route = "checkout";

    const views = { home: homeView, shop: shopView, product: () => productView(arg), cart: cartView, checkout: checkoutView, payment: paymentView, success: successView, invoice: invoiceView };
    const view = views[route] || homeView;
    if (!views[route]) route = "home";

    document.title = "RVELLARVELL WATCHES";
    app.innerHTML = `<div class="page">${view()}</div>`;

    document.querySelectorAll("[data-nav]").forEach(b => {
      const active = b.dataset.nav === route || (route === "product" && b.dataset.nav === "shop");
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    closeMenu();
    updateBadge();
    window.scrollTo(0, 0);
    const h = app.querySelector("h1, h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }

    if (route === "home") startHero();
    if (route === "invoice") document.title = `Invoice ${state.order.invoiceNo} — RVELLARVELL WATCHES`;
    if (route === "payment") hookQr();
    scheduleIdle();
  }

  /* ------------------------------ Image fallback ------------------------------ */
  // If an image file fails to load (e.g. the images/ folder was not uploaded), use the built-in copy from images.js.
  function useEmbedded(img) {
    const emb = window.EMBEDDED_IMAGES && EMBEDDED_IMAGES[img.dataset.key];
    if (emb && img.src !== emb && !img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.removeAttribute("loading");
      img.src = emb;
      return true;
    }
    return false;
  }
  document.addEventListener("error", (e) => {
    if (e.target && e.target.tagName === "IMG" && e.target.dataset.key) useEmbedded(e.target);
  }, true);

  /* ------------------------------ Views ------------------------------ */
  function imgTag(p, extra = "", eager = false) {
    return `<img class="fit-${p.fit}" src="${esc(p.image)}" data-key="${esc(p.image)}" alt="${esc(p.shortName)}" ${eager ? "" : 'loading="lazy"'} decoding="async" ${extra}>`;
  }

  function productCard(p) {
    return `
      <article class="card">
        <button class="card-media" style="background:${esc(p.bg)}" data-go="product/${esc(p.id)}" aria-label="View details: ${esc(p.shortName)}">
          ${imgTag(p)}
        </button>
        <div class="card-body">
          <h3 class="card-name" title="${esc(p.name)}">${esc(p.name)}</h3>
          ${priceHtml(p)}
          <div class="card-actions">
            <button class="btn btn-primary" data-action="add" data-id="${esc(p.id)}">ADD TO CART</button>
            <button class="btn btn-ghost" data-go="product/${esc(p.id)}">VIEW DETAILS</button>
          </div>
        </div>
      </article>`;
  }

  const HERO_IDS = ["fireboltt-legacy", "apple-series-11", "fireboltt-talk-ultra", "fireboltt-axiom"];

  function homeView() {
    const slides = HERO_IDS.map(getProduct).filter(Boolean);
    return `
      <section class="hero">
        <div class="hero-copy">
          <h1>TIME, REDEFINED.</h1>
          <hr class="hero-rule">
          <p>Discover technology, precision and style in one place.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" data-go="shop">EXPLORE COLLECTION</button>
            <button class="btn btn-ghost" data-go="cart">VIEW CART</button>
          </div>
        </div>
        <div class="stage" aria-hidden="true">
          ${slides.map((p, i) => `<div class="slide${i === 0 ? " active" : ""}" style="background:${esc(p.bg)}" data-name="${esc(p.shortName)}">${imgTag(p, "", i === 0)}</div>`).join("")}
          <div class="stage-cap" id="stage-cap">${esc(slides[0].shortName)}</div>
        </div>
      </section>
      <section class="section wrap">
        <div class="section-head">
          <h2 class="section-title">The collection</h2>
          <button class="link-btn" data-go="shop">View all products</button>
        </div>
        <div class="grid">${products.slice(0, 4).map(productCard).join("")}</div>
      </section>`;
  }

  function startHero() {
    const slides = [...document.querySelectorAll(".slide")];
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    timers.hero = setInterval(() => {
      slides[i].classList.remove("active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("active");
      const cap = document.getElementById("stage-cap");
      if (cap) cap.textContent = slides[i].dataset.name;
    }, 4500);
  }

  function shopView() {
    return `
      <div class="wrap">
        <div class="page-head">
          <h1 class="page-title">The collection</h1>
          <p class="page-sub">Tap a product to see details, or add it straight to your cart.</p>
        </div>
        <div class="grid" style="padding-bottom:clamp(40px,6vw,90px)">${products.map(productCard).join("")}</div>
      </div>`;
  }

  function productView(id) {
    const p = getProduct(id);
    if (!p) return shopView();
    return `
      <div class="wrap">
        <div class="back-row"><button class="link-btn" data-go="shop">← BACK TO SHOP</button></div>
        <section class="detail">
          <div class="detail-media" style="background:${esc(p.bg)}">${imgTag(p, "", true)}</div>
          <div>
            <h1>${esc(p.name)}</h1>
            ${priceHtml(p)}
            <p class="detail-desc">${esc(p.description)}</p>
            <div class="detail-buy">
              <div class="qty" role="group" aria-label="Quantity">
                <button data-action="dq-dec" aria-label="Decrease quantity" disabled>−</button>
                <output id="dq-val" aria-live="polite">1</output>
                <button data-action="dq-inc" aria-label="Increase quantity">+</button>
              </div>
              <button class="btn btn-primary" data-action="add-detail" data-id="${esc(p.id)}">ADD TO CART</button>
            </div>
            <button class="btn btn-ghost" data-go="shop">BACK TO SHOP</button>
          </div>
        </section>
      </div>`;
  }

  function cartView() {
    const lines = cartLines();
    if (!lines.length) {
      return `<div class="wrap empty"><h2>YOUR CART IS EMPTY</h2><button class="btn btn-primary" data-go="shop">CONTINUE SHOPPING</button></div>`;
    }
    return `
      <div class="wrap">
        <div class="page-head"><h1 class="page-title">Your cart</h1></div>
        <div class="cart-layout">
          <div class="cart-list">
            ${lines.map(({ p, qty }) => `
              <div class="cart-row" data-row="${esc(p.id)}">
                <div class="cart-thumb" style="background:${esc(p.bg)}">${imgTag(p)}</div>
                <div class="cart-info">
                  <p class="cart-name">${esc(p.name)}</p>
                  <p class="cart-unit">${p.price > 0 ? money(p.price) : "[ADD PRICE]"} each</p>
                </div>
                <div class="qty sm" role="group" aria-label="Quantity for ${esc(p.shortName)}">
                  <button data-action="cart-dec" data-id="${esc(p.id)}" aria-label="Decrease quantity" ${qty <= 1 ? "disabled" : ""}>−</button>
                  <output>${qty}</output>
                  <button data-action="cart-inc" data-id="${esc(p.id)}" aria-label="Increase quantity" ${qty >= MAX_QTY ? "disabled" : ""}>+</button>
                </div>
                <p class="cart-sub">${money(p.price * qty)}</p>
                <button class="remove-btn" data-action="remove" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.shortName)} from cart">REMOVE</button>
              </div>`).join("")}
          </div>
          <aside class="summary" aria-label="Cart totals">
            <h2>Summary</h2>
            <div class="sum-line"><span>SUBTOTAL</span><span>${money(cartTotal())}</span></div>
            <div class="sum-line total"><span>TOTAL</span><span>${money(cartTotal())}</span></div>
            <button class="btn btn-primary btn-block" data-go="checkout">PROCEED TO CHECKOUT</button>
            <button class="btn btn-ghost btn-block" data-go="shop">CONTINUE SHOPPING</button>
          </aside>
        </div>
      </div>`;
  }

  function summaryItems() {
    return `<div class="sum-items">${cartLines().map(({ p, qty }) => `
      <div class="sum-item">
        <span class="nm">${esc(p.name)}</span>
        <span class="st">${money(p.price * qty)}</span>
        <span class="meta">Qty ${qty} × ${p.price > 0 ? money(p.price) : "[ADD PRICE]"}</span>
      </div>`).join("")}</div>`;
  }

  function field(id, label, opts = {}) {
    const f = state.form;
    const req = opts.optional ? `<span class="opt">(optional)</span>` : `<span class="req" aria-hidden="true">*</span>`;
    const common = `id="f-${id}" name="${id}" class="input" autocomplete="off" ${opts.optional ? "" : 'aria-required="true"'} aria-describedby="err-${id}"`;
    let control;
    if (id === "address") control = `<textarea ${common} rows="3">${esc(f.address)}</textarea>`;
    else if (id === "state") control = `<select ${common}><option value="">Select state</option>${INDIAN_STATES.map(s => `<option${f.state === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
    else control = `<input ${common} type="${opts.type || "text"}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} ${opts.maxlength ? `maxlength="${opts.maxlength}"` : ""} value="${esc(f[id])}">`;
    return `<div class="field ${opts.full ? "full" : ""}" id="field-${id}"><label for="f-${id}">${label}${req}</label>${control}<p class="err" id="err-${id}" role="alert"></p></div>`;
  }

  function checkoutView() {
    return `
      <div class="wrap">
        <div class="page-head">
          <h1 class="page-title">Checkout</h1>
          <p class="page-sub">Fields marked <span class="req">*</span> are required.</p>
        </div>
        <div class="checkout-layout">
          <div>
            <form id="checkout-form" class="panel" novalidate autocomplete="off">
              <h2>Your details</h2>
              <p class="hint">Used only for this order.</p>
              <div class="form-grid">
                ${field("name", "FULL NAME", { full: true })}
                ${field("phone", "MOBILE / CONTACT NUMBER", { type: "tel", inputmode: "tel", maxlength: 15 })}
                ${field("email", "EMAIL ADDRESS", { type: "email", inputmode: "email", optional: true })}
                ${field("address", "ADDRESS", { full: true })}
                ${field("city", "CITY")}
                ${field("state", "STATE")}
                ${field("pin", "PIN CODE", { inputmode: "numeric", maxlength: 6 })}
              </div>
            </form>

            <section class="panel" aria-labelledby="pay-h">
              <h2 id="pay-h">PAYMENT METHOD</h2>
              <p class="hint">Choose how you would like to pay.</p>
              <div class="pay-options" role="radiogroup" aria-labelledby="pay-h">
                <label class="pay-card">
                  <input type="radio" name="pay" value="cod" ${state.payment === "cod" ? "checked" : ""}>
                  <span class="pay-body"><span class="pay-dot"></span><span><span class="pay-title">CASH ON DELIVERY</span><span class="pay-note" style="display:block">Pay when your order arrives</span></span></span>
                </label>
                <label class="pay-card">
                  <input type="radio" name="pay" value="upi" ${state.payment === "upi" ? "checked" : ""}>
                  <span class="pay-body"><span class="pay-dot"></span><span><span class="pay-title">UPI / ONLINE PAYMENT</span><span class="pay-note" style="display:block">Scan the shop's QR code</span></span></span>
                </label>
              </div>
              <p class="err pay-err" id="err-pay" role="alert"></p>
              <div class="pay-info" id="pay-info" ${state.payment ? "" : "hidden"}>${payInfoHtml()}</div>
              <button class="btn btn-primary btn-block pay-submit" id="btn-submit" data-action="submit-checkout" data-lock>${submitLabel()}</button>
            </section>
          </div>

          <aside class="summary" aria-label="Order summary">
            <h2>Order summary</h2>
            ${summaryItems()}
            <div class="sum-line total"><span>TOTAL</span><span>${money(cartTotal())}</span></div>
            <button class="btn btn-ghost btn-block" data-go="cart" data-lock>BACK TO CART</button>
          </aside>
        </div>
      </div>`;
  }
  const submitLabel = () => state.payment === "cod" ? "PLACE ORDER" : state.payment === "upi" ? "PROCEED TO PAYMENT" : "CONTINUE";
  const payInfoHtml = () => state.payment === "cod"
    ? `Payment Method: <strong>Cash on Delivery</strong>`
    : state.payment === "upi"
      ? `Payment Method: <strong>UPI / Online Payment</strong>. You will scan the shop's QR code on the next screen.`
      : "";

  function paymentView() {
    return `
      <div class="wrap">
        <div class="pay-screen">
          <p class="pay-amount-label">TOTAL AMOUNT</p>
          <h1 class="pay-amount">${money(cartTotal())}</h1>
          <div class="qr-frame" id="qr-frame"><img id="qr-img" src="${esc(cfg.upiQrImage)}" data-key="${esc(cfg.upiQrImage)}" alt="Shop UPI QR code"></div>
          <p class="pay-instruction">Scan the QR code using your UPI app and complete the payment.</p>
          <p class="pay-warn">Payment is verified by shop staff. Tap PAYMENT DONE only after you have paid.</p>
          <div class="pay-buttons">
            <button class="btn btn-danger" data-action="cancel-order" data-lock>CANCEL ORDER</button>
            <button class="btn btn-primary" data-action="payment-done" data-lock>PAYMENT DONE</button>
          </div>
        </div>
      </div>`;
  }
  function hookQr() {
    const img = document.getElementById("qr-img");
    if (!img) return;
    const showMissing = () => {
      document.getElementById("qr-frame").innerHTML = `<p class="qr-missing">UPI QR image not found.<br>Add your QR image at <b>${esc(cfg.upiQrImage)}</b>.</p>`;
    };
    if (img.complete && img.naturalWidth === 0 && !useEmbedded(img)) showMissing();
    // 1st error = file missing (global handler swaps in the built-in copy); 2nd error = even that failed.
    let errors = 0;
    img.addEventListener("error", () => { errors += 1; if (errors >= 2) showMissing(); });
  }

  function successView() {
    const o = state.order;
    const upi = o.payment.method === "upi";
    return `
      <div class="wrap">
        <section class="success">
          <div class="check" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c9ab6b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
          <h1>ORDER CONFIRMED</h1>
          <p class="lead">Thank you, <strong>${esc(o.customer.name)}</strong>.<br>Your order has been successfully recorded.</p>
          <dl class="facts">
            <div class="fact"><dt>ORDER ID</dt><dd>${esc(o.orderId)}</dd></div>
            <div class="fact"><dt>INVOICE NUMBER</dt><dd>${esc(o.invoiceNo)}</dd></div>
            <div class="fact"><dt>PAYMENT METHOD</dt><dd>${esc(o.payment.methodLabel)}</dd></div>
            ${upi ? `<div class="fact"><dt>PAYMENT STATUS</dt><dd>${esc(o.payment.status)}</dd></div>` : ""}
            <div class="fact big"><dt>TOTAL AMOUNT</dt><dd>${money(o.total)}</dd></div>
          </dl>
          ${state.notify === "failed" ? `
            <div class="notice" role="alert">
              <p>${esc(NOTIFY_FAIL_MSG)}</p>
              <button class="btn btn-ghost" data-action="retry-notify" data-lock>TRY NOTIFYING AGAIN</button>
            </div>` : ""}
          <div class="success-actions">
            <button class="btn btn-primary" data-go="invoice">VIEW INVOICE</button>
            <button class="btn btn-ghost" data-action="reset-home">BACK TO HOME</button>
          </div>
        </section>
      </div>`;
  }

  function invoiceView() {
    const o = state.order;
    const c = o.customer;
    const upi = o.payment.method === "upi";
    return `
      <div class="wrap">
        <div class="invoice-bar no-print">
          <button class="btn btn-primary" data-action="print">PRINT INVOICE</button>
          <button class="btn btn-ghost" data-action="reset-home">BACK TO HOME</button>
        </div>
        <div class="invoice-wrap">
          <article class="invoice" aria-label="Invoice ${esc(o.invoiceNo)}">
            <div class="inv-head">
              <div><div class="inv-brand">RVELLARVELL WATCHES</div><div class="inv-title">INVOICE</div></div>
              <div class="inv-meta">
                <div><b>Invoice Number</b>${esc(o.invoiceNo)}</div>
                <div><b>Order ID</b>${esc(o.orderId)}</div>
                <div><b>Date</b>${esc(o.date)}</div>
                <div><b>Time</b>${esc(o.time)}</div>
              </div>
            </div>
            <div class="inv-cols">
              <div>
                <div class="inv-h">CUSTOMER DETAILS</div>
                <p><b>${esc(c.name)}</b><br>Contact: ${esc(c.phone)}<br>${esc(c.address).replace(/\n/g, "<br>")}<br>${esc(c.city)}, ${esc(c.state)} — ${esc(c.pin)}${c.email ? `<br>${esc(c.email)}` : ""}</p>
              </div>
              <div>
                <div class="inv-h">PAYMENT INFORMATION</div>
                <p>Payment Method: <b>${esc(o.payment.methodLabel)}</b>${upi ? `<br>Payment Status: <b>${esc(o.payment.status)}</b>` : ""}</p>
              </div>
            </div>
            <div class="inv-h">ORDER DETAILS</div>
            <table class="inv-table">
              <thead><tr><th>PRODUCT</th><th class="num">QTY</th><th class="num">UNIT PRICE</th><th class="num">SUBTOTAL</th></tr></thead>
              <tbody>${o.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.subtotal)}</td></tr>`).join("")}</tbody>
            </table>
            <div class="inv-total"><span>TOTAL</span><span>${money(o.total)}</span></div>
            <p class="inv-foot">Thank you for shopping at RVELLARVELL WATCHES.</p>
          </article>
        </div>
      </div>`;
  }

  /* ------------------------------ Cart actions ------------------------------ */
  function addToCart(id, qty = 1) {
    const p = getProduct(id);
    if (!p) return;
    const line = state.cart.find(l => l.id === id);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + qty); else state.cart.push({ id, qty: Math.min(MAX_QTY, Math.max(1, qty)) });
    persist();
    updateBadge(true);
    toast(`${p.shortName} added to cart`);
  }
  function changeQty(id, delta) {
    const line = state.cart.find(l => l.id === id);
    if (!line) return;
    line.qty = Math.min(MAX_QTY, Math.max(1, line.qty + delta));
    persist();
    refreshCart(id, "cart-" + (delta > 0 ? "inc" : "dec"));
  }
  function removeItem(id) {
    state.cart = state.cart.filter(l => l.id !== id);
    persist();
    refreshCart(null);
  }
  function refreshCart(focusId, action) {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (focusId) {
      let el = document.querySelector(`[data-action="${action}"][data-id="${focusId}"]:not([disabled])`)
        || document.querySelector(`[data-action="cart-inc"][data-id="${focusId}"], [data-action="cart-dec"][data-id="${focusId}"]`);
      if (el) el.focus({ preventScroll: true });
      const row = document.querySelector(`[data-row="${focusId}"]`);
      if (row) row.classList.add("bumping");
    }
  }

  /* ------------------------------ Checkout / validation ------------------------------ */
  function collectForm() {
    const g = (id) => { const el = document.getElementById("f-" + id); return el ? el.value : state.form[id]; };
    Object.keys(state.form).forEach(k => { state.form[k] = g(k); });
  }

  function validateForm(silent) {
    const f = state.form;
    const errs = {};
    const phoneDigits = f.phone.replace(/[\s\-()]/g, "").replace(/^\+?91/, "");
    if (!f.name.trim()) errs.name = "Please enter your full name.";
    if (!f.phone.trim()) errs.phone = "Please enter your mobile number.";
    else if (!/^[6-9]\d{9}$/.test(phoneDigits)) errs.phone = "Enter a valid 10-digit mobile number.";
    if (!f.address.trim()) errs.address = "Please enter your address.";
    if (!f.city.trim()) errs.city = "Please enter your city.";
    if (!f.state) errs.state = "Please select your state.";
    if (!f.pin.trim()) errs.pin = "Please enter your PIN code.";
    else if (!/^\d{6}$/.test(f.pin.trim())) errs.pin = "PIN code must be 6 digits.";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errs.email = "Enter a valid email address, or leave it empty.";
    if (silent) return Object.keys(errs).length === 0;
    showErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function showErrors(errs) {
    ["name", "phone", "address", "city", "state", "pin", "email"].forEach(id => {
      const wrap = document.getElementById("field-" + id);
      const err = document.getElementById("err-" + id);
      const input = document.getElementById("f-" + id);
      if (!wrap) return;
      wrap.classList.toggle("has-error", !!errs[id]);
      err.textContent = errs[id] || "";
      if (errs[id]) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    });
    const first = Object.keys(errs)[0];
    if (first) {
      const el = document.getElementById("f-" + first);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  }

  function submitCheckout() {
    if (state.submitting || state.order) return;
    collectForm();
    const formOk = validateForm(false);
    const errPay = document.getElementById("err-pay");
    if (!state.payment) {
      errPay.textContent = "Please choose a payment method.";
      if (formOk) document.getElementById("err-pay").scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    errPay.textContent = "";
    if (!formOk) return;
    if (state.payment === "cod") createOrder("cod");
    else navigate("payment");
  }

  /* ------------------------------ Orders ------------------------------ */
  function buildOrder(method) {
    const now = new Date();
    const ids = generateIds(now);
    const f = state.form;
    const items = cartLines().map(({ p, qty }) => ({ id: p.id, name: p.name, qty, price: p.price, subtotal: p.price * qty }));
    return {
      orderId: ids.orderId,
      invoiceNo: ids.invoiceNo,
      createdAt: now.toISOString(),
      date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      customer: {
        name: f.name.trim(),
        phone: f.phone.trim(),
        address: f.address.trim(),
        city: f.city.trim(),
        state: f.state,
        pin: f.pin.trim(),
        email: f.email.trim()
      },
      items,
      total: items.reduce((s, i) => s + i.subtotal, 0),
      payment: method === "upi"
        ? { method: "upi", methodLabel: "UPI / Online Payment", status: UPI_STATUS }
        : { method: "cod", methodLabel: "Cash on Delivery", status: "" }
    };
  }

  async function sendOrderEmail(order) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(cfg.orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": order.orderId },
        body: JSON.stringify(order),
        signal: ctl.signal
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return data.ok === true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  function lockUI(on, label) {
    document.querySelectorAll("[data-lock]").forEach(b => {
      b.disabled = on;
      if (on && label && b.dataset.action === "submit-checkout") b.textContent = label;
    });
    const mb = document.querySelector(".overlay [data-lock]");
    if (mb) mb.disabled = on;
  }

  async function createOrder(method) {
    if (state.submitting || state.order) return;   // duplicate-submission guard
    state.submitting = true;
    lockUI(true, "PLACING ORDER…");
    const confirmBtn = document.getElementById("modal-confirm");
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "PLACING ORDER…"; }

    const order = buildOrder(method);
    state.order = order;          // order is stored before anything else can fail
    state.cart = [];
    state.notify = "pending";
    persist();
    updateBadge();

    const ok = await sendOrderEmail(order);
    state.notify = ok ? "sent" : "failed";
    persist();
    state.submitting = false;
    closeModal();
    navigate("success");
  }

  async function retryNotify() {
    if (state.notifying || !state.order) return;
    state.notifying = true;
    lockUI(true);
    const btn = document.querySelector('[data-action="retry-notify"]');
    if (btn) btn.textContent = "SENDING…";
    const ok = await sendOrderEmail(state.order);
    state.notify = ok ? "sent" : "failed";
    state.notifying = false;
    persist();
    render();
    if (ok) toast("Shop has been notified");
  }

  /* ------------------------------ Modal ------------------------------ */
  let modal = null;
  let modalOnEsc = null;
  let lastFocus = null;

  function openModal({ title, text, strong, buttons, onEsc }) {
    closeModal();
    lastFocus = document.activeElement;
    modal = document.createElement("div");
    modal.className = "overlay";
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        ${strong ? `<p class="strong">${esc(strong)}</p>` : ""}
        ${text ? `<p>${esc(text)}</p>` : ""}
        <div class="modal-actions ${buttons.length === 2 ? "two" : ""}"></div>
      </div>`;
    const box = modal.querySelector(".modal-actions");
    buttons.forEach(b => {
      const el = document.createElement("button");
      el.className = `btn ${b.kind || "btn-ghost"}`;
      el.textContent = b.label;
      if (b.id) el.id = b.id;
      if (b.lock) el.setAttribute("data-lock", "");
      el.addEventListener("click", b.onClick);
      box.appendChild(el);
    });
    modalOnEsc = onEsc || null;
    document.body.appendChild(modal);
    (modal.querySelector(".btn-primary") || modal.querySelector(".btn")).focus();
  }
  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
    modalOnEsc = null;
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    lastFocus = null;
  }
  document.addEventListener("keydown", (e) => {
    if (!modal) return;
    if (e.key === "Escape" && modalOnEsc) { e.preventDefault(); modalOnEsc(); }
    if (e.key === "Tab") {  // keep focus inside the dialog
      const f = [...modal.querySelectorAll("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function askPaymentDone() {
    if (state.submitting || state.order) return;
    openModal({
      title: "Payment marked as completed.",
      strong: "Payment verification is required by shop staff.",
      text: "Confirm to place your order.",
      buttons: [
        { label: "CONFIRM ORDER", kind: "btn-primary", id: "modal-confirm", lock: true, onClick: () => createOrder("upi") },
        { label: "GO BACK", kind: "btn-ghost", onClick: closeModal }
      ],
      onEsc: closeModal
    });
  }

  function askCancelOrder() {
    if (state.submitting || state.order) return;
    openModal({
      title: "Are you sure you want to cancel this order?",
      buttons: [
        { label: "CANCEL ORDER", kind: "btn-danger", onClick: confirmCancel },
        { label: "KEEP PAYMENT", kind: "btn-primary", onClick: closeModal }
      ],
      onEsc: closeModal
    });
  }
  function confirmCancel() {
    // No order is created and no email is sent. Customer details are cleared; the cart is kept.
    state.form = emptyForm();
    state.payment = null;
    closeModal();
    toast("Order cancelled");
    navigate("cart");
  }

  /* ------------------------------ Kiosk reset ------------------------------ */
  function resetSession() {
    state.cart = [];
    state.form = emptyForm();
    state.payment = null;
    state.order = null;
    state.notify = "idle";
    state.submitting = false;
    state.notifying = false;
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    closeModal();
    updateBadge();
    navigate("home");
  }

  function isDirty() {
    const [route] = parseHash();
    const formUsed = Object.values(state.form).some(v => String(v).trim());
    return state.cart.length > 0 || !!state.order || formUsed || !["home", "shop"].includes(route);
  }

  function clearIdle() { clearTimeout(timers.idle); clearTimeout(timers.idleWarn); clearInterval(timers.idleTick); }
  function scheduleIdle() {
    if (modal && modal.dataset.idle) return;      // warning is showing — wait for answer
    clearIdle();
    if (!isDirty() || state.submitting) return;
    const [route] = parseHash();
    const secs = route === "payment" ? cfg.idleSecondsPayment : cfg.idleSeconds;
    timers.idle = setTimeout(showIdleWarning, secs * 1000);
  }
  function showIdleWarning() {
    if (state.submitting || !isDirty()) return;
    let left = cfg.idleWarningSeconds;
    openModal({
      title: "Still there?",
      text: `Tap to continue. This screen will reset in ${left} seconds.`,
      buttons: [
        { label: "CONTINUE", kind: "btn-primary", onClick: () => { closeModal(); scheduleIdle(); } },
        { label: "START OVER", kind: "btn-ghost", onClick: resetSession }
      ],
      onEsc: () => { closeModal(); scheduleIdle(); }
    });
    modal.dataset.idle = "1";
    const p = modal.querySelector(".modal p");
    timers.idleTick = setInterval(() => {
      left -= 1;
      if (p) p.textContent = `Tap to continue. This screen will reset in ${left} seconds.`;
      if (left <= 0) { clearInterval(timers.idleTick); resetSession(); }
    }, 1000);
  }
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(ev =>
    window.addEventListener(ev, () => { if (!(modal && modal.dataset.idle)) scheduleIdle(); }, { passive: true }));

  /* ------------------------------ Menu ------------------------------ */
  function closeMenu() {
    document.getElementById("nav").classList.remove("open");
    document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
  }
  document.getElementById("menu-toggle").addEventListener("click", (e) => {
    const open = document.getElementById("nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });

  /* ------------------------------ Events ------------------------------ */
  let detailQty = 1;

  document.addEventListener("click", (e) => {
    const goEl = e.target.closest("[data-go]");
    const actEl = e.target.closest("[data-action]");
    if (actEl && !actEl.disabled) {
      const id = actEl.dataset.id;
      switch (actEl.dataset.action) {
        case "add": addToCart(id, 1); return;
        case "add-detail": addToCart(id, detailQty); detailQty = 1; syncDetailQty(); return;
        case "dq-dec": detailQty = Math.max(1, detailQty - 1); syncDetailQty(); return;
        case "dq-inc": detailQty = Math.min(MAX_QTY, detailQty + 1); syncDetailQty(); return;
        case "cart-inc": changeQty(id, 1); return;
        case "cart-dec": changeQty(id, -1); return;
        case "remove": removeItem(id); return;
        case "submit-checkout": submitCheckout(); return;
        case "payment-done": askPaymentDone(); return;
        case "cancel-order": askCancelOrder(); return;
        case "retry-notify": retryNotify(); return;
        case "print": window.print(); return;
        case "reset-home": resetSession(); return;
      }
    }
    if (goEl && !goEl.disabled) {
      const to = goEl.dataset.go;
      if (to.startsWith("product/")) detailQty = 1;
      if (to === "checkout") collectFormSafe();
      navigate(to);
    }
  });

  function collectFormSafe() { if (document.getElementById("checkout-form")) collectForm(); }

  function syncDetailQty() {
    const out = document.getElementById("dq-val");
    if (!out) return;
    out.textContent = detailQty;
    document.querySelector('[data-action="dq-dec"]').disabled = detailQty <= 1;
    document.querySelector('[data-action="dq-inc"]').disabled = detailQty >= MAX_QTY;
  }

  // Keep typed values in memory and clear errors as the customer fixes them.
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.id || !t.id.startsWith("f-")) return;
    const key = t.id.slice(2);
    if (key === "phone") t.value = t.value.replace(/[^\d+\s\-()]/g, "");
    if (key === "pin") t.value = t.value.replace(/\D/g, "").slice(0, 6);
    state.form[key] = t.value;
    const wrap = document.getElementById("field-" + key);
    if (wrap && wrap.classList.contains("has-error")) {
      wrap.classList.remove("has-error");
      document.getElementById("err-" + key).textContent = "";
      t.removeAttribute("aria-invalid");
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "pay") {
      state.payment = t.value;
      document.getElementById("err-pay").textContent = "";
      const info = document.getElementById("pay-info");
      info.hidden = false;
      info.innerHTML = payInfoHtml();
      document.getElementById("btn-submit").textContent = submitLabel();
    } else if (t.id === "f-state") {
      state.form.state = t.value;
    }
  });
  document.addEventListener("submit", (e) => { e.preventDefault(); submitCheckout(); });

  window.addEventListener("hashchange", render);
  window.addEventListener("beforeprint", () => { /* print CSS handles layout */ });

  /* ------------------------------ Boot ------------------------------ */
  restore();
  if (!location.hash) history.replaceState(null, "", "#/home");
  render();
})();
