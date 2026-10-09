# RVELLARVELL WATCHES — shop kiosk website

Plain HTML/CSS/JS. No build step.

```
index.html      page shell
style.css       design + print layout
script.js       cart, checkout, orders, invoice, kiosk reset
products.js     PRODUCTS, PRICES and store config  <- edit this
images/         product-1..8.jpg and upi-qr.png
api/order.js    serverless function that emails the owner
```

## Change a price
Open `products.js`, change the number in `price:` (rupees), save, redeploy.

## Deploy (free, ~5 minutes) — Vercel
The email function must run on a server, so a static-only host (like GitHub Pages) will show the "shop notification failed" message on every order.

1. Create a free account at vercel.com and upload this folder (via GitHub, or `npx vercel` in the folder).
2. Create a free account at resend.com and make an API key.
3. In Vercel > Project > Settings > Environment Variables add:
   - `RESEND_API_KEY` = your Resend key (secret, stays on the server)
   - `OWNER_EMAIL` = rudranshgoantiya89@gmail.com (already the default)
   - `FROM_EMAIL` = optional; see below
4. Redeploy. Open the site on the tablet.

**Important about Resend's free test sender:** with the default `onboarding@resend.dev` sender, Resend only delivers to the email address you signed up to Resend with. So either sign up to Resend using the owner's email (rudranshgoantiya89@gmail.com), or verify your own domain in Resend and set `FROM_EMAIL` to an address on it.

## Test it before opening the shop
Place a COD order and a UPI order. Check that the owner receives both emails and that the invoice prints. If the email fails, the customer sees the "ask staff to confirm" message and a retry button.

## Kiosk notes
- Add the site to the tablet's home screen / use full-screen (kiosk) browser mode.
- Between customers, **BACK TO HOME** wipes the cart, details, order and invoice. Customer details are kept in memory only.
- If a screen is left untouched for 2.5 minutes (5 minutes on the UPI payment screen), it asks "Still there?" and resets after 30 seconds. Change these in `products.js` (`STORE_CONFIG`).
- UPI payments are NOT verified by the website. The order says "Marked as completed — staff verification required" so staff can check the payment in the UPI app.
- To replace the QR, overwrite `images/upi-qr.png`.

## Images not showing?
Upload **every** file and folder (`index.html`, `style.css`, `script.js`, `products.js`, `images.js`, the `images/` folder and the `api/` folder). The site also carries built-in copies of the photos in `images.js`, so pictures still appear even if the `images/` folder is missing — but `images.js` itself must be uploaded.
