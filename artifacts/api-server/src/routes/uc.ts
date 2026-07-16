import { Router, type Request, type Response } from "express";

const router = Router();

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PRODUCTS: Record<string, unknown>[] = [
  {
    id: 101, name: "UCF-500 Reverse Osmosis System", price: "45000",
    regularPrice: "48000", salePrice: "45000",
    description: "5-Stage RO system removes 99.9% of contaminants. Includes remineralization filter for healthy mineral balance. NSF certified membranes.",
    shortDescription: "Premium 5-stage RO system for pure drinking water",
    categories: [{ id: 1, name: "RO Systems" }],
    images: [{ src: "https://placehold.co/400x400/0054A6/FFFFFF/png?text=UCF-500+RO", alt: "UCF-500" }],
    sku: "UCF-500-RO", stockStatus: "instock", stockQuantity: 15,
    tags: [{ name: "bestseller" }, { name: "household" }],
  },
  {
    id: 102, name: "UCF-200 Ultrafiltration System", price: "22000",
    regularPrice: "22000", salePrice: "",
    description: "Under-sink ultrafiltration system with 0.01 micron hollow fiber membrane. Retains beneficial minerals while removing bacteria and viruses.",
    shortDescription: "Under-sink UF system that keeps healthy minerals",
    categories: [{ id: 2, name: "Ultrafiltration" }],
    images: [{ src: "https://placehold.co/400x400/0054A6/FFFFFF/png?text=UCF-200+UF", alt: "UCF-200" }],
    sku: "UCF-200-UF", stockStatus: "instock", stockQuantity: 8,
    tags: [{ name: "compact" }, { name: "under-sink" }],
  },
  {
    id: 103, name: "UCF-UV100 UV Purifier", price: "15500",
    regularPrice: "17000", salePrice: "15500",
    description: "UV disinfection system that eliminates 99.99% of bacteria and viruses without chemicals. 12-month lamp life.",
    shortDescription: "Chemical-free UV disinfection for any tap",
    categories: [{ id: 3, name: "UV Systems" }],
    images: [{ src: "https://placehold.co/400x400/0054A6/FFFFFF/png?text=UCF-UV100", alt: "UCF-UV100" }],
    sku: "UCF-UV100", stockStatus: "instock", stockQuantity: 20,
    tags: [{ name: "sale" }, { name: "compact" }],
  },
  {
    id: 104, name: "UCF-WH1000 Whole-House System", price: "68000",
    regularPrice: "68000", salePrice: "",
    description: "Complete whole-house water treatment with sediment, carbon, and UV stages. Protects all appliances and provides safe water at every tap.",
    shortDescription: "Complete whole-house water treatment solution",
    categories: [{ id: 4, name: "Whole-House" }],
    images: [{ src: "https://placehold.co/400x400/0054A6/FFFFFF/png?text=UCF-WH1000", alt: "UCF-WH1000" }],
    sku: "UCF-WH1000", stockStatus: "instock", stockQuantity: 5,
    tags: [{ name: "commercial" }, { name: "whole-house" }],
  },
  {
    id: 105, name: "UCF-500 Replacement Filter Set", price: "3800",
    regularPrice: "4200", salePrice: "3800",
    description: "Complete annual replacement filter set for UCF-500 RO System.",
    shortDescription: "Annual filter set for UCF-500 RO System",
    categories: [{ id: 5, name: "Replacement Filters" }],
    images: [{ src: "https://placehold.co/400x400/00B4D8/FFFFFF/png?text=Filter+Set", alt: "Filter Set" }],
    sku: "UCF-500-FILTER", stockStatus: "instock", stockQuantity: 50,
    tags: [{ name: "replacement" }, { name: "bestseller" }],
  },
  {
    id: 106, name: "UCF-200 Replacement Membrane", price: "2900",
    regularPrice: "2900", salePrice: "",
    description: "Genuine UCF-200 hollow fiber ultrafiltration membrane. Replace every 18-24 months.",
    shortDescription: "Genuine replacement membrane for UCF-200",
    categories: [{ id: 5, name: "Replacement Filters" }],
    images: [{ src: "https://placehold.co/400x400/00B4D8/FFFFFF/png?text=Membrane", alt: "Membrane" }],
    sku: "UCF-200-MEM", stockStatus: "instock", stockQuantity: 35,
    tags: [{ name: "replacement" }],
  },
  {
    id: 107, name: 'UCF-100 Sediment Filter 10"', price: "850",
    regularPrice: "850", salePrice: "",
    description: "5-micron spun polypropylene sediment filter. Replace every 3 months.",
    shortDescription: "5-micron sediment pre-filter cartridge",
    categories: [{ id: 5, name: "Replacement Filters" }],
    images: [{ src: "https://placehold.co/400x400/00B4D8/FFFFFF/png?text=Sediment", alt: "Sediment" }],
    sku: "UCF-100-SED", stockStatus: "instock", stockQuantity: 100,
    tags: [{ name: "replacement" }],
  },
  {
    id: 108, name: 'UCF Carbon Block Filter 10"', price: "1200",
    regularPrice: "1200", salePrice: "",
    description: "Activated carbon block filter removes chlorine, taste, odor, and VOCs. Replace every 6 months.",
    shortDescription: "Activated carbon block filter cartridge",
    categories: [{ id: 5, name: "Replacement Filters" }],
    images: [{ src: "https://placehold.co/400x400/00B4D8/FFFFFF/png?text=Carbon", alt: "Carbon" }],
    sku: "UCF-CARBON", stockStatus: "instock", stockQuantity: 80,
    tags: [{ name: "replacement" }],
  },
];

const MOCK_LOCATIONS = [
  { id: "loc1", type: "experience_centre", name: "UC Experience Centre Westlands", address: "Woodvale Groove, Westlands, Nairobi", lat: -1.2633, lng: 36.8072, hours: "Mon–Sat 8am–6pm, Sun 10am–4pm", phone: "+254 700 123456" },
  { id: "loc2", type: "experience_centre", name: "UC Service Centre Karen", address: "Karen Hardy Estate, Karen, Nairobi", lat: -1.3319, lng: 36.7097, hours: "Mon–Fri 8am–5pm", phone: "+254 700 654321" },
  { id: "loc3", type: "refill_atm", name: "Water ATM – Village Market", address: "Village Market Mall, Limuru Rd, Gigiri", lat: -1.2194, lng: 36.8083, hours: "24/7", phone: null },
  { id: "loc4", type: "refill_atm", name: "Water ATM – Sarit Centre", address: "Sarit Centre, Karuna Rd, Westlands", lat: -1.2592, lng: 36.8027, hours: "6am–11pm daily", phone: null },
  { id: "loc5", type: "refill_atm", name: "Water ATM – Two Rivers Mall", address: "Two Rivers Mall, Rhapta Rd, Westlands", lat: -1.2178, lng: 36.7985, hours: "7am–10pm daily", phone: null },
  { id: "loc6", type: "refill_atm", name: "Water ATM – Garden City", address: "Garden City Mall, Thika Superhighway", lat: -1.2241, lng: 36.8801, hours: "6am–10pm daily", phone: null },
  { id: "loc7", type: "refill_atm", name: "Water ATM – Junction Mall", address: "Junction Mall, Ngong Rd, Nairobi", lat: -1.3003, lng: 36.7773, hours: "7am–9pm daily", phone: null },
];

const ticketStore: Record<string, unknown>[] = [];
const waterTestStore: Record<string, unknown>[] = [];
const orderStore: Record<string, unknown>[] = [];

// ─── WooCommerce helpers ──────────────────────────────────────────────────────
function hasWCCredentials(): boolean {
  return !!(process.env["WC_CONSUMER_KEY"] && process.env["WC_CONSUMER_SECRET"]);
}

function wcUrl(path: string, extra: Record<string, string> = {}): string {
  const base = process.env["WC_BASE_URL"] || "https://www.ucfilters.com";
  const url = new URL(`${base}/wp-json/wc/v3${path}`);
  url.searchParams.set("consumer_key", process.env["WC_CONSUMER_KEY"]!);
  url.searchParams.set("consumer_secret", process.env["WC_CONSUMER_SECRET"]!);
  Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function wcFetchArray(
  path: string,
  extra: Record<string, string> = {}
): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(wcUrl(path, extra));
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

async function wcFetchOne(
  path: string,
  extra: Record<string, string> = {}
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(wcUrl(path, extra));
    const data: unknown = await res.json();
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeProduct(p: Record<string, unknown>): Record<string, unknown> {
  return {
    id: p["id"],
    name: p["name"],
    price: p["price"],
    regularPrice: p["regular_price"],
    salePrice: p["sale_price"],
    description: p["description"],
    shortDescription: p["short_description"],
    categories: p["categories"],
    images: p["images"],
    sku: p["sku"],
    stockStatus: p["stock_status"],
    stockQuantity: p["stock_quantity"],
    tags: p["tags"],
  };
}

function normalizeOrder(o: Record<string, unknown>): Record<string, unknown> {
  const li = Array.isArray(o["line_items"])
    ? (o["line_items"] as Record<string, unknown>[]).map((i) => ({
        productId: i["product_id"],
        name: i["name"],
        quantity: i["quantity"],
        total: i["total"],
      }))
    : [];
  return {
    id: o["id"],
    status: o["status"],
    dateCreated: o["date_created"],
    total: o["total"],
    currency: o["currency"],
    paymentMethod: o["payment_method"],
    shippingAddress: o["shipping"],
    lineItems: li,
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/uc/products", async (req: Request, res: Response): Promise<void> => {
  try {
    if (hasWCCredentials()) {
      const extra: Record<string, string> = { per_page: "50" };
      if (req.query["category"]) extra["category"] = req.query["category"] as string;
      if (req.query["search"]) extra["search"] = req.query["search"] as string;
      const products = await wcFetchArray("/products", extra);
      if (products) {
        res.json(products.map(normalizeProduct));
        return;
      }
    }
    let data = MOCK_PRODUCTS;
    if (req.query["category"]) {
      const cat = (req.query["category"] as string).toLowerCase();
      data = data.filter((p) => {
        const cats = p["categories"] as { name: string }[] | undefined;
        return cats?.some((c) => c.name.toLowerCase() === cat);
      });
    }
    if (req.query["search"]) {
      const q = (req.query["search"] as string).toLowerCase();
      data = data.filter(
        (p) =>
          (p["name"] as string).toLowerCase().includes(q) ||
          (p["sku"] as string).toLowerCase().includes(q)
      );
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/uc/products/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]));
  try {
    if (hasWCCredentials()) {
      const product = await wcFetchOne(`/products/${id}`);
      if (product) {
        res.json(normalizeProduct(product));
        return;
      }
    }
    const product = MOCK_PRODUCTS.find((p) => p["id"] === id);
    if (!product) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(product);
  } catch {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post("/uc/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  try {
    const wcBase = process.env["WC_BASE_URL"] || "https://www.ucfilters.com";
    const jwtRes = await fetch(`${wcBase}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });
    const jwtData: unknown = await jwtRes.json();
    if (
      jwtData &&
      typeof jwtData === "object" &&
      "token" in jwtData &&
      typeof (jwtData as Record<string, unknown>)["token"] === "string"
    ) {
      const d = jwtData as Record<string, unknown>;
      const displayName = (d["user_display_name"] as string | undefined) ?? "";
      res.json({
        token: d["token"],
        user: {
          id: 1,
          email: d["user_email"],
          firstName: displayName.split(" ")[0] ?? "Customer",
          lastName: displayName.split(" ").slice(1).join(" "),
        },
      });
      return;
    }
  } catch { /* fall through to mock */ }

  if (email && password.length >= 6) {
    const name = email.split("@")[0] ?? "customer";
    const mockUser = {
      id: Date.now(),
      email,
      firstName: name.charAt(0).toUpperCase() + name.slice(1),
      lastName: "Customer",
    };
    res.json({ token: `demo_token_${Date.now()}`, user: mockUser });
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
});

router.post("/uc/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password, firstName, lastName } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };
  if (!email || !password || !firstName) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const user = { id: Date.now(), email, firstName, lastName: lastName ?? "" };
  res.json({ token: `demo_token_${Date.now()}`, user });
});

// ─── Customer ─────────────────────────────────────────────────────────────────
router.get("/uc/customer/profile", (_req: Request, res: Response): void => {
  res.json({
    id: 1,
    email: "customer@example.com",
    firstName: "Jane",
    lastName: "Doe",
    billing: { firstName: "Jane", lastName: "Doe", address1: "123 Westlands Rd", address2: "", city: "Nairobi", country: "KE", phone: "+254700000000" },
    shipping: { firstName: "Jane", lastName: "Doe", address1: "123 Westlands Rd", address2: "", city: "Nairobi", country: "KE", phone: "+254700000000" },
  });
});

// ─── Payment verification helpers (server-side; called before order creation) ─
async function verifyPaymentOnServer(
  method: string,
  reference: string
): Promise<{ ok: boolean; reason?: string }> {
  // COD requires no pre-payment
  if (method === "cod") return { ok: true };

  if (!reference) return { ok: false, reason: "No payment reference provided" };

  // ── M-Pesa ──
  if (method === "mpesa") {
    const shortcode = process.env["MPESA_SHORTCODE"];
    const passkey = process.env["MPESA_PASSKEY"];
    const key = process.env["MPESA_CONSUMER_KEY"];
    const secret = process.env["MPESA_CONSUMER_SECRET"];
    if (!key || !secret || !shortcode || !passkey) {
      // Mock mode: accept any reference
      return { ok: true };
    }
    try {
      const creds = Buffer.from(`${key}:${secret}`).toString("base64");
      const env = process.env["MPESA_ENV"] === "production" ? "api" : "sandbox";
      const tokenRes = await fetch(
        `https://${env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${creds}` } }
      );
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      const token = tokenData.access_token;
      if (!token) return { ok: false, reason: "Failed to get M-Pesa token" };
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
      const qRes = await fetch(`https://${env}.safaricom.co.ke/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: reference }),
      });
      const qData = (await qRes.json()) as Record<string, string>;
      const ok = qData["ResultCode"] === "0";
      return ok ? { ok: true } : { ok: false, reason: qData["ResultDesc"] ?? "M-Pesa not confirmed" };
    } catch {
      return { ok: false, reason: "M-Pesa verification request failed" };
    }
  }

  // ── Stripe ──
  if (method === "stripe") {
    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    if (!stripeKey) {
      // Mock mode: accept any session ID
      return { ok: true };
    }
    try {
      const StripeSDK = await import("stripe");
      const stripe = new StripeSDK.default(stripeKey);
      const session = await stripe.checkout.sessions.retrieve(reference);
      const ok = session.payment_status === "paid";
      return ok ? { ok: true } : { ok: false, reason: `Stripe session status: ${session.payment_status}` };
    } catch (e: unknown) {
      return { ok: false, reason: (e as Error).message };
    }
  }

  // ── Paystack ──
  if (method === "paystack") {
    const secretKey = process.env["PAYSTACK_SECRET_KEY"];
    if (!secretKey) {
      // Mock mode: accept any reference
      return { ok: true };
    }
    try {
      const vRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } }
      );
      const vData = (await vRes.json()) as { status: boolean; data?: { status: string } };
      const ok = vData.status && vData.data?.status === "success";
      return ok ? { ok: true } : { ok: false, reason: `Paystack status: ${vData.data?.status ?? "unknown"}` };
    } catch {
      return { ok: false, reason: "Paystack verification request failed" };
    }
  }

  return { ok: false, reason: `Unknown payment method: ${method}` };
}

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get("/uc/orders", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (hasWCCredentials()) {
      const orders = await wcFetchArray("/orders", { per_page: "20", orderby: "date", order: "desc" });
      if (orders) {
        res.json(orders.map(normalizeOrder));
        return;
      }
    }
    res.json(orderStore);
  } catch {
    res.json(orderStore);
  }
});

router.post("/uc/orders", async (req: Request, res: Response): Promise<void> => {
  const { lineItems, paymentMethod, paymentReference, shippingAddress } = req.body as {
    lineItems: { productId: number; quantity: number }[];
    paymentMethod: string;
    paymentReference?: string;
    shippingAddress?: Record<string, string>;
  };
  if (!lineItems || !paymentMethod) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Server-side payment verification — gate order creation on confirmed payment.
  // Only COD is allowed without a reference; all other methods must produce a verified reference.
  const verification = await verifyPaymentOnServer(paymentMethod, paymentReference ?? "");
  if (!verification.ok) {
    res.status(402).json({ error: "Payment not verified", reason: verification.reason });
    return;
  }

  const isPaid = paymentMethod !== "cod";

  try {
    if (hasWCCredentials()) {
      const orderPayload = {
        payment_method: paymentMethod,
        payment_method_title:
          paymentMethod === "mpesa" ? "M-Pesa" :
          paymentMethod === "stripe" ? "Credit Card (Stripe)" :
          paymentMethod === "paystack" ? "Paystack" : "Cash on Delivery",
        set_paid: isPaid,
        shipping: shippingAddress,
        line_items: lineItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        meta_data: [{ key: "payment_reference", value: paymentReference ?? "" }],
      };
      const orderRes = await fetch(wcUrl("/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const order: unknown = await orderRes.json();
      if (order && typeof order === "object" && "id" in order) {
        res.json(normalizeOrder(order as Record<string, unknown>));
        return;
      }
    }
  } catch { /* fall through to mock */ }

  const products = lineItems.map((i) => {
    const p = MOCK_PRODUCTS.find((m) => m["id"] === i.productId);
    const price = parseFloat((p?.["price"] as string | undefined) ?? "0");
    return {
      productId: i.productId,
      name: (p?.["name"] as string | undefined) ?? "Product",
      quantity: i.quantity,
      total: String(price * i.quantity),
    };
  });
  const total = products.reduce((s, i) => s + parseFloat(i.total), 0);
  const newOrder = {
    id: Date.now(),
    status: paymentMethod === "cod" ? "pending" : "processing",
    dateCreated: new Date().toISOString(),
    total: String(total),
    currency: "KES",
    lineItems: products,
    paymentMethod,
    shippingAddress: shippingAddress ?? {},
  };
  orderStore.push(newOrder);
  res.json(newOrder);
});

// ─── Locations ────────────────────────────────────────────────────────────────
router.get("/uc/locations", (_req: Request, res: Response): void => {
  res.json(MOCK_LOCATIONS);
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
router.get("/uc/tickets", (_req: Request, res: Response): void => {
  res.json(ticketStore);
});

router.post("/uc/tickets", (req: Request, res: Response): void => {
  const { productModel, issueDescription, preferredContactTime, photos } = req.body as {
    productModel?: string;
    issueDescription?: string;
    preferredContactTime?: string;
    photos?: string[];
  };
  if (!productModel || !issueDescription) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const ticket = {
    id: `TKT-${Date.now()}`,
    productModel,
    issueDescription,
    preferredContactTime: preferredContactTime ?? "Any time",
    photos: photos ?? [],
    status: "submitted",
    createdAt: new Date().toISOString(),
  };
  ticketStore.push(ticket);
  res.status(201).json(ticket);
});

// ─── Water Tests ──────────────────────────────────────────────────────────────
router.post("/uc/water-tests", (req: Request, res: Response): void => {
  const { name, address, phone, waterSource, concerns } = req.body as {
    name?: string;
    address?: string;
    phone?: string;
    waterSource?: string;
    concerns?: string;
  };
  if (!name || !address || !phone) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const wt = {
    id: `WT-${Date.now()}`,
    name,
    address,
    phone,
    waterSource: waterSource ?? "Municipal",
    concerns: concerns ?? "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  waterTestStore.push(wt);
  res.status(201).json(wt);
});

export default router;
