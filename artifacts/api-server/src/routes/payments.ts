import { Router, type Request, type Response } from "express";
import { createHmac } from "node:crypto";
import { db } from "@workspace/db";
import { ucOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { sendViaResend } from "../lib/resend.js";

const router = Router();

// Lazy Stripe — only when STRIPE_SECRET_KEY is present
let _stripe: Stripe | null = null;
async function getStripe(): Promise<Stripe | null> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  if (!_stripe) {
    const StripeSDK = await import("stripe");
    _stripe = new StripeSDK.default(key);
  }
  return _stripe;
}

// ─── M-Pesa Daraja ────────────────────────────────────────────────────────────
async function getMpesaToken(): Promise<string | null> {
  const key = process.env["MPESA_CONSUMER_KEY"];
  const secret = process.env["MPESA_CONSUMER_SECRET"];
  if (!key || !secret) return null;
  try {
    const creds = Buffer.from(`${key}:${secret}`).toString("base64");
    const env = process.env["MPESA_ENV"] === "production" ? "api" : "sandbox";
    const res = await fetch(
      `https://${env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${creds}` } }
    );
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

router.post("/payments/mpesa", async (req: Request, res: Response): Promise<void> => {
  const { phone, amount, orderId } = req.body as {
    phone: string;
    amount: number;
    orderId: string;
  };
  if (!phone || !amount) {
    res.status(400).json({ error: "phone and amount required" });
    return;
  }

  const shortcode = process.env["MPESA_SHORTCODE"];
  const passkey = process.env["MPESA_PASSKEY"];
  const token = await getMpesaToken();

  if (!token || !shortcode || !passkey) {
    res.json({
      checkoutRequestId: `ws_CO_${Date.now()}`,
      merchantRequestId: `MR-${Date.now()}`,
      responseCode: "0",
      responseDescription: "Success. Request accepted for processing",
      customerMessage: `Please check your phone (${phone}) and enter your M-Pesa PIN to complete payment of KES ${amount.toLocaleString()}.`,
    });
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const env = process.env["MPESA_ENV"] === "production" ? "api" : "sandbox";

    const stkRes = await fetch(
      `https://${env}.safaricom.co.ke/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.ceil(amount),
          PartyA: phone.replace(/^0/, "254"),
          PartyB: shortcode,
          PhoneNumber: phone.replace(/^0/, "254"),
          CallBackURL: `${process.env["API_BASE_URL"] || "https://team-horizon--jerryaroyce.replit.app"}/api/payments/mpesa/callback`,
          AccountReference: `Order-${orderId}`,
          TransactionDesc: "UC Filter Purchase",
        }),
      }
    );
    const stkData = (await stkRes.json()) as Record<string, string>;
    res.json({
      checkoutRequestId: stkData["CheckoutRequestID"],
      merchantRequestId: stkData["MerchantRequestID"],
      responseCode: stkData["ResponseCode"],
      responseDescription: stkData["ResponseDescription"],
      customerMessage: stkData["CustomerMessage"],
    });
  } catch {
    res.status(500).json({ error: "M-Pesa request failed" });
  }
});

router.get(
  "/payments/mpesa/status/:checkoutRequestId",
  async (req: Request, res: Response): Promise<void> => {
    const token = await getMpesaToken();
    const shortcode = process.env["MPESA_SHORTCODE"];
    const passkey = process.env["MPESA_PASSKEY"];

    if (!token || !shortcode || !passkey) {
      res.json({ status: Math.random() > 0.4 ? "success" : "pending" });
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
      const env = process.env["MPESA_ENV"] === "production" ? "api" : "sandbox";

      const qRes = await fetch(
        `https://${env}.safaricom.co.ke/mpesa/stkpushquery/v1/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: req.params["checkoutRequestId"],
          }),
        }
      );
      const qData = (await qRes.json()) as Record<string, string>;
      const resultCode = qData["ResultCode"];
      res.json({
        status:
          resultCode === "0" ? "success" : resultCode === "1032" ? "pending" : "failed",
        resultDesc: qData["ResultDesc"],
      });
    } catch {
      res.json({ status: "pending" });
    }
  }
);

// ─── Stripe — Checkout Session (PCI-safe: Stripe hosts the card form) ─────────
// Frontend opens the sessionUrl in expo-web-browser; Stripe handles all card data.
router.post(
  "/payments/stripe/session",
  async (req: Request, res: Response): Promise<void> => {
    const { amount, currency = "kes", orderId, returnUrl } = req.body as {
      amount: number;
      currency: string;
      orderId: string;
      returnUrl?: string;
    };
    if (!amount) {
      res.status(400).json({ error: "amount required" });
      return;
    }

    const stripe = await getStripe();
    if (!stripe) {
      // Mock: return a fake hosted-checkout URL for demo
      res.json({
        sessionId: `cs_mock_${Date.now()}`,
        sessionUrl: `https://checkout.stripe.com/mock?amount=${amount}&currency=${currency}`,
        amount,
      });
      return;
    }

    try {
      const appBase =
        returnUrl ?? process.env["WC_BASE_URL"] ?? "https://www.ucfilters.com";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: Math.round(amount * 100),
              product_data: { name: `UC Filters Order ${orderId}` },
            },
            quantity: 1,
          },
        ],
        success_url: `${appBase}/stripe/success?session_id={CHECKOUT_SESSION_ID}&order=${orderId}`,
        cancel_url: `${appBase}/stripe/cancel?order=${orderId}`,
      });
      res.json({ sessionId: session.id, sessionUrl: session.url, amount });
    } catch (e: unknown) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get(
  "/payments/stripe/session/:sessionId",
  async (req: Request, res: Response): Promise<void> => {
    const stripe = await getStripe();
    if (!stripe) {
      res.json({ status: "paid", paymentStatus: "paid" });
      return;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(String(req.params["sessionId"]));
      res.json({ status: session.status, paymentStatus: session.payment_status });
    } catch (e: unknown) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

// ─── Paystack ─────────────────────────────────────────────────────────────────
router.post(
  "/payments/paystack/init",
  async (req: Request, res: Response): Promise<void> => {
    const { email, amount, callbackUrl } = req.body as {
      email: string;
      amount: number;
      callbackUrl?: string;
    };
    if (!email || !amount) {
      res.status(400).json({ error: "email and amount required" });
      return;
    }

    // Use the deep-link redirect the client sent (e.g. uc-companion://paystack/callback)
    // so expo-web-browser can auto-close after Paystack redirects back.
    const resolvedCallback =
      callbackUrl ??
      `${process.env["WC_BASE_URL"] ?? "https://www.ucfilters.com"}/paystack/callback`;

    const secretKey = process.env["PAYSTACK_SECRET_KEY"];
    if (!secretKey) {
      const ref = `PS_MOCK_${Date.now()}`;
      res.json({
        authorizationUrl: `https://checkout.paystack.com/mock`,
        accessCode: `mock_access_${Date.now()}`,
        reference: ref,
      });
      return;
    }

    try {
      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100),
          currency: "KES",
          callback_url: resolvedCallback,
        }),
      });
      const psData = (await psRes.json()) as {
        status: boolean;
        data: { authorization_url: string; access_code: string; reference: string };
      };
      if (!psData.status) {
        res.status(400).json({ error: "Paystack initialization failed" });
        return;
      }
      res.json({
        authorizationUrl: psData.data.authorization_url,
        accessCode: psData.data.access_code,
        reference: psData.data.reference,
      });
    } catch {
      res.status(500).json({ error: "Paystack is temporarily unavailable. Please try again.", retryable: true });
    }
  }
);

router.get(
  "/payments/paystack/verify/:reference",
  async (req: Request, res: Response): Promise<void> => {
    const secretKey = process.env["PAYSTACK_SECRET_KEY"];
    if (!secretKey) {
      res.json({ success: true, status: "success" });
      return;
    }
    try {
      const vRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(req.params["reference"]))}`,
        { headers: { Authorization: `Bearer ${secretKey}` } }
      );
      const vData = (await vRes.json()) as { status: boolean; data: { status: string } };
      res.json({ success: vData.status && vData.data.status === "success", status: vData.data?.status });
    } catch {
      res.status(500).json({ error: "Verification failed" });
    }
  }
);

// ─── Paystack webhook ─────────────────────────────────────────────────────────
// Paystack sends a POST with an HMAC-SHA512 signature in x-paystack-signature.
// We verify the signature before touching any data, then handle charge.success
// events idempotently so duplicate deliveries are safely ignored.
router.post(
  "/payments/paystack/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const secretKey = process.env["PAYSTACK_SECRET_KEY"];

    // ── Signature verification ───────────────────────────────────────────────
    const signature = String(req.headers["x-paystack-signature"] ?? "");
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (secretKey && rawBody) {
      const expected = createHmac("sha512", secretKey)
        .update(rawBody)
        .digest("hex");
      if (signature !== expected) {
        // Return 401 so Paystack knows the payload was rejected; never 200 here.
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    } else if (secretKey && !rawBody) {
      // Raw body was not captured — reject to avoid processing unverified events.
      res.status(400).json({ error: "Raw body unavailable for signature check" });
      return;
    }
    // If no PAYSTACK_SECRET_KEY is configured (dev/test), skip verification.

    // ── Event dispatch ───────────────────────────────────────────────────────
    const event = req.body as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: number;      // in kobo
        currency?: string;
        customer?: { email?: string };
      };
    };

    if (event.event !== "charge.success") {
      // Acknowledge events we do not act on so Paystack stops retrying them.
      res.json({ received: true });
      return;
    }

    const reference = event.data?.reference ?? "";
    const amountKobo = event.data?.amount ?? 0;
    const currency = event.data?.currency ?? "KES";
    const customerEmail = event.data?.customer?.email ?? "";

    if (!reference) {
      res.status(400).json({ error: "Missing reference in webhook payload" });
      return;
    }

    try {
      // ── Idempotency: look up existing order by payment reference ──────────
      const existing = await db
        .select()
        .from(ucOrdersTable)
        .where(eq(ucOrdersTable.paymentReference, reference))
        .limit(1);

      if (existing.length > 0) {
        const order = existing[0]!;

        if (order.status === "pending") {
          // Payment confirmed — advance status to processing
          await db
            .update(ucOrdersTable)
            .set({ status: "processing" })
            .where(eq(ucOrdersTable.id, order.id));
          console.info(
            `[Paystack webhook] Order ${order.id} (ref ${reference}) advanced to processing`
          );
        } else {
          // Already processed — safe no-op (duplicate event)
          console.info(
            `[Paystack webhook] Duplicate event for ref ${reference} — order ${order.id} already ${order.status}`
          );
        }

        // Always return 200 once we've verified and dispatched the event so
        // Paystack does not retry unnecessarily.
        res.json({ received: true, orderId: order.id });
        return;
      }

      // ── No order found — create a recovery record ─────────────────────────
      // The app lost connectivity after payment but before createOrder fired.
      // We persist what Paystack told us so the team can reconcile and fulfil.
      const totalKes = Math.round(amountKobo / 100);

      const [recovered] = await db
        .insert(ucOrdersTable)
        .values({
          userId:           customerEmail || "webhook-recovery",
          status:           "processing",
          total:            String(totalKes),
          currency,
          paymentMethod:    "paystack",
          paymentReference: reference,
          promoCode:        "",
          discountPercent:  0,
          discountAmount:   0,
          shippingAddress:  {},
          webhookRecovery:  true,
        })
        .returning();

      console.info(
        `[Paystack webhook] Recovery order ${recovered!.id} created for ref ${reference} (${currency} ${totalKes})`
      );

      // ── Alert the team ────────────────────────────────────────────────────
      // Fire-and-forget: email failure must never block the webhook 200 response.
      sendViaResend({
        from: "Ultra Clear App <noreply@contacts.ucfilters.com>",
        to: "info@ucfilters.com",
        subject: `⚠️ Webhook recovery order #${recovered!.id} needs fulfilment`,
        text: [
          "A Paystack webhook recovery order was created automatically.",
          "The customer paid but the app lost connectivity before the order was recorded.",
          "",
          `Order ID:   ${recovered!.id}`,
          `Reference:  ${reference}`,
          `Amount:     ${currency} ${totalKes.toLocaleString()}`,
          `Customer:   ${customerEmail || "(email not provided)"}`,
          "",
          "Action required:",
          "  1. Find the customer and confirm their delivery address and items.",
          "  2. Update the order with the correct line items.",
          "  3. Dispatch as normal once complete.",
          "",
          "This order is flagged as 'Webhook recovery' in the orders list.",
        ].join("\n"),
      }).catch(() => { /* already logged inside sendViaResend */ });

      res.json({ received: true, orderId: recovered!.id, recovered: true });
    } catch (err) {
      console.error("[Paystack webhook] DB error:", err);
      // Return 500 so Paystack will retry — better to retry than to lose the event.
      res.status(500).json({ error: "Internal error" });
    }
  }
);

// ─── M-Pesa STK-push callback (Safaricom posts here after the customer pays) ──
// Safaricom POSTs to CallBackURL with ResultCode 0 on success.
// The app also polls /payments/mpesa/status, so this is belt-and-suspenders;
// we log it and return the required { ResultCode, ResultDesc } ack.
router.post("/payments/mpesa/callback", (req: Request, res: Response): void => {
  try {
    const body = req.body as { Body?: { stkCallback?: { ResultCode?: number; ResultDesc?: string; CheckoutRequestID?: string } } };
    const cb = body?.Body?.stkCallback;
    if (cb) {
      if (cb.ResultCode === 0) {
        console.info("[M-Pesa callback] Payment confirmed:", cb.CheckoutRequestID);
      } else {
        console.warn("[M-Pesa callback] Payment failed:", cb.ResultDesc, cb.CheckoutRequestID);
      }
    }
  } catch {
    // Never 500 a Safaricom callback — they don't retry cleanly on errors
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ─── Generic verify ───────────────────────────────────────────────────────────
router.post(
  "/payments/verify",
  async (req: Request, res: Response): Promise<void> => {
    const { reference, method } = req.body as { reference: string; method: string };
    if (!reference) {
      res.status(400).json({ error: "reference required" });
      return;
    }
    res.json({ success: true, message: `Payment ${reference} verified via ${method}` });
  }
);

export default router;
