/* ==========================================================================
   RVELLARVELL WATCHES — order email endpoint (Vercel serverless function)
   Runs on the SERVER only. Secrets are read from environment variables and
   are never sent to the browser.

   ----- CONFIGURATION (set these in Vercel > Project > Settings > Environment Variables) -----
   RESEND_API_KEY : your Resend API key (secret)            <- REQUIRED
   OWNER_EMAIL    : where new-order emails are delivered     <- defaults to the address below
   FROM_EMAIL     : sender, e.g. "RVELLARVELL WATCHES <orders@yourdomain.com>"
                    (defaults to Resend's test sender, see README)
   ========================================================================== */

const OWNER_EMAIL = process.env.OWNER_EMAIL || "rudranshgoantiya89@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "RVELLARVELL WATCHES <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const UPI_STATUS = "Marked as completed — staff verification required";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const str = (v, max = 500) => String(v ?? "").slice(0, max);

function clean(body) {
  if (!body || typeof body !== "object") return null;
  const c = body.customer || {};
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!items.length || !str(body.orderId) || !str(c.name)) return null;

  const cleanItems = items.map(i => {
    const qty = Math.max(1, Math.min(99, parseInt(i.qty, 10) || 1));
    const price = Math.max(0, Number(i.price) || 0);
    return { name: str(i.name, 300), qty, price, subtotal: price * qty };
  });
  const isUpi = body.payment && body.payment.method === "upi";
  return {
    orderId: str(body.orderId, 60),
    invoiceNo: str(body.invoiceNo, 60),
    date: str(body.date, 40),
    time: str(body.time, 40),
    customer: {
      name: str(c.name, 120), phone: str(c.phone, 30), address: str(c.address, 600),
      city: str(c.city, 80), state: str(c.state, 80), pin: str(c.pin, 10), email: str(c.email, 120)
    },
    items: cleanItems,
    total: cleanItems.reduce((s, i) => s + i.subtotal, 0),   // recomputed on the server
    payment: isUpi
      ? { methodLabel: "UPI / Online Payment", status: UPI_STATUS }
      : { methodLabel: "Cash on Delivery", status: "" }
  };
}

function buildText(o) {
  const lines = [
    "NEW ORDER RECEIVED", "", "RVELLARVELL WATCHES", "",
    `Order ID: ${o.orderId}`, `Invoice Number: ${o.invoiceNo}`, `Date: ${o.date}`, `Time: ${o.time}`, "",
    "CUSTOMER DETAILS",
    `Name: ${o.customer.name}`, `Contact Number: ${o.customer.phone}`, `Address: ${o.customer.address}`,
    `City: ${o.customer.city}`, `State: ${o.customer.state}`, `PIN Code: ${o.customer.pin}`,
    `Email: ${o.customer.email || "Not provided"}`, "",
    "ORDER DETAILS"
  ];
  o.items.forEach((i, n) => {
    lines.push(`Product ${n + 1}: ${i.name}`, `Quantity: ${i.qty}`, `Price: ${inr(i.price)}`, `Subtotal: ${inr(i.subtotal)}`, "");
  });
  lines.push(`TOTAL: ${inr(o.total)}`, `Payment Method: ${o.payment.methodLabel}`);
  if (o.payment.status) lines.push(`Payment Status: ${o.payment.status}`);
  return lines.join("\n");
}

function buildHtml(o) {
  const row = (k, v) => `<tr><td style="padding:4px 14px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
  return `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px">
    <h2 style="margin:0 0 4px">NEW ORDER RECEIVED</h2>
    <p style="margin:0 0 18px;letter-spacing:2px;color:#555">RVELLARVELL WATCHES</p>
    <table>${row("Order ID", o.orderId)}${row("Invoice Number", o.invoiceNo)}${row("Date", o.date)}${row("Time", o.time)}</table>
    <h3 style="margin:22px 0 6px">CUSTOMER DETAILS</h3>
    <table>${row("Name", o.customer.name)}${row("Contact Number", o.customer.phone)}${row("Address", o.customer.address)}${row("City", o.customer.city)}${row("State", o.customer.state)}${row("PIN Code", o.customer.pin)}${row("Email", o.customer.email || "Not provided")}</table>
    <h3 style="margin:22px 0 6px">ORDER DETAILS</h3>
    ${o.items.map((i, n) => `<div style="border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin-bottom:8px">
      <div><b>Product ${n + 1}:</b> ${esc(i.name)}</div>
      <div>Quantity: <b>${i.qty}</b> &nbsp; Price: <b>${inr(i.price)}</b> &nbsp; Subtotal: <b>${inr(i.subtotal)}</b></div></div>`).join("")}
    <p style="font-size:18px;margin:16px 0 4px"><b>TOTAL: ${inr(o.total)}</b></p>
    <p style="margin:2px 0">Payment Method: <b>${esc(o.payment.methodLabel)}</b></p>
    ${o.payment.status ? `<p style="margin:2px 0">Payment Status: <b>${esc(o.payment.status)}</b></p>` : ""}
  </div>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ ok: false, error: "Email service not configured" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const order = clean(body);
  if (!order) return res.status(400).json({ ok: false, error: "Invalid order" });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `order-${order.orderId}`   // a repeat request for the same order won't send a second email
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [OWNER_EMAIL],
        subject: `New Order - RVELLARVELL WATCHES - ${order.orderId}`,
        text: buildText(order),
        html: buildHtml(order)
      })
    });
    if (!r.ok) {
      console.error("Resend error", r.status, await r.text());
      return res.status(502).json({ ok: false, error: "Email delivery failed" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Email request failed", e);
    return res.status(502).json({ ok: false, error: "Email delivery failed" });
  }
};
