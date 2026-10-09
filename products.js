/* ==========================================================================
   RVELLARVELL WATCHES — STORE CONFIG + PRODUCT DATA
   This is the ONLY file you need to edit to change prices or products.
   ========================================================================== */

/* ---------- STORE CONFIG (safe, public values only — never put secrets here) ---------- */
const STORE_CONFIG = {
  shopName: "RVELLARVELL WATCHES",
  tagline: "Time, redefined.",

  // Your fixed UPI QR image. Save it as images/upi-qr.png (or change this path).
  upiQrImage: "images/upi-qr.png",

  // Serverless endpoint that emails the shop owner. See README.md.
  // The owner email and email-service keys live on the SERVER (api/order.js + env vars).
  orderEndpoint: "/api/order",

  // Kiosk auto-reset: after this many seconds without a touch, the customer
  // is asked "Still there?" and the session is cleared if nobody answers.
  idleSeconds: 150,        // browsing / cart / checkout
  idleSecondsPayment: 300, // on the UPI payment screen (customers need longer)
  idleWarningSeconds: 30
};

/* ---------- PRODUCTS ----------
   price: 0  ->  shows "[ADD PRICE]" on the site.
   Replace each 0 with the real price in rupees, e.g. price: 4999
   bg / fit control how the photo sits inside its square frame.            */
const products = [
  {
    id: "apple-series-11",
    name: "Apple Watch Series 11 GPS 46mm Jet Black Aluminium Case with Black Sport Band - M/L",
    shortName: "Apple Watch Series 11",
    description: "Apple Watch Series 11 (GPS) with a 46mm Jet Black aluminium case and a black Sport Band in size M/L.",
    price: 48999, // Product 1 price (₹)
    image: "images/product-1.jpg",
    bg: "#1a1a1c",
    fit: "contain"
  },
  {
    id: "fireboltt-axiom",
    name: "Fire-Boltt Axiom Round Smart Watch 1.43\" Super AMOLED Display with Always-On Mode, Bluetooth Calling, Rotating Crown, SpO₂ & Heart Rate Monitor, IP67 Waterproof Silicone Smartwatch for Men - Black",
    shortName: "Fire-Boltt Axiom",
    description: "Round 1.43\" Super AMOLED display with Always-On mode, Bluetooth calling and a rotating crown. SpO₂ and heart rate monitoring, IP67 waterproof, silicone strap. Black.",
    price: 2500, // Product 2 price (₹)
    image: "images/product-2.jpg",
    bg: "#161412",
    fit: "cover"
  },
  {
    id: "fireboltt-legacy",
    name: "Fire-Boltt Legacy Luxury Round Smart Watch 1.43\" Super AMOLED, Bluetooth Calling, Wireless Charging, Voice Assistant, SpO₂ & Heart Rate Monitor, 110+ Sports Modes, Metal Smart Watch for Men & Women - Black",
    shortName: "Fire-Boltt Legacy",
    description: "Luxury round smartwatch with a 1.43\" Super AMOLED display, Bluetooth calling, wireless charging and a voice assistant. SpO₂ and heart rate monitor, 110+ sports modes, metal build. Black.",
    price: 2300, // Product 3 price (₹)
    image: "images/product-3.jpg",
    bg: "#0b0b0b",
    fit: "cover"
  },
  {
    id: "fastrack-astor-fr2-pro",
    name: "Fastrack Astor FR2 Pro 1.43\" AMOLED Stainless Steel Smart Watch with SpO₂, Heart Rate, BT Calling, Adaptive AOD, Functional Crown, AI Voice Assistant – Smartwatch for Stylish Professionals (Black)",
    shortName: "Fastrack Astor FR2 Pro",
    description: "Stainless steel smartwatch with a 1.43\" AMOLED display, BT calling, adaptive always-on display, functional crown and AI voice assistant. SpO₂ and heart rate tracking. Black.",
    price: 2300, // Product 4 price (₹)
    image: "images/product-4.jpg",
    bg: "#ffffff",
    fit: "contain"
  },
  {
    id: "noisefit-halo",
    name: "NoiseFit Halo 1.43\" AMOLED Display, Bluetooth Calling Round Dial Smart Watch, Premium Metallic Build, Always on Display, Smart Gesture Control, 100 Sports Modes (Vintage Brown)",
    shortName: "NoiseFit Halo",
    description: "Round-dial smartwatch with a 1.43\" AMOLED always-on display, Bluetooth calling, premium metallic build, smart gesture control and 100 sports modes. Vintage Brown.",
    price: 11000, // Product 5 price (₹)
    image: "images/product-5.jpg",
    bg: "#ffffff",
    fit: "contain"
  },
  {
    id: "fireboltt-talk-ultra",
    name: "Fire-Boltt Talk Ultra 1.39\" Round Display Stainless Steel Luxury Smart Watch, Bluetooth Calling & 360 Health Monitoring, 123 Sports Modes, Inbuilt Voice Assistant (Black Dual)",
    shortName: "Fire-Boltt Talk Ultra",
    description: "Stainless steel luxury smartwatch with a 1.39\" round display, Bluetooth calling, 360 health monitoring, 123 sports modes and an inbuilt voice assistant. Black Dual.",
    price: 3200, // Product 6 price (₹)
    image: "images/product-6.jpg",
    bg: "#050505",
    fit: "cover"
  },
  {
    id: "fireboltt-fire-lens-f2-pro",
    name: "Fire-Boltt Fire-Lens F2 Pro AI Camera Smart Glasses, 8MP Camera, Hands-Free Photo & Video, Vision AI, 32GB Storage, Open-Ear Audio, Voice & Touch Control",
    shortName: "Fire-Lens F2 Pro Smart Glasses",
    description: "AI camera smart glasses with an 8MP camera for hands-free photo and video, Vision AI, 32GB storage, open-ear audio, and voice and touch control. (Smart glasses — not a watch.)",
    price: 3500, // Product 7 price (₹)
    image: "images/product-7.jpg",
    bg: "#0a0a0a",
    fit: "cover"
  },
  {
    id: "fireboltt-talk",
    name: "Fire-Boltt Talk Bluetooth Calling Smartwatch, 1.39\" TFT Display with Dual Button, Hands On Voice Assistance, 120 Sports Modes, in Built Mic & Speaker (Talk, Black)",
    shortName: "Fire-Boltt Talk",
    description: "Bluetooth calling smartwatch with a 1.39\" TFT display, dual button, hands-on voice assistance, 120 sports modes and an inbuilt mic and speaker.",
    price: 2200, // Product 8 price (₹)
    image: "images/product-8.jpg",
    bg: "#050505",
    fit: "cover"
  }
];
