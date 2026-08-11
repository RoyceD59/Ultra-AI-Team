/**
 * Tests for the M-Pesa STK-push callback handler.
 *
 * Covers:
 *   (a) Non-zero ResultCode → acked without any DB action.
 *   (b) Missing CheckoutRequestID → acked without any DB action.
 *   (c) Daraja rejects (non-0 from query API) → acked without any DB action.
 *   (d) Unknown CheckoutRequestID (no initiation record) → rejected even when
 *       Daraja confirms payment.  This is the critical anti-fraud test: a valid
 *       payment to our shortcode that we did not initiate cannot trigger an order.
 *   (e) Expired initiation record → rejected.
 *   (f) Daraja unavailable + initiation present → order stored as "pending"
 *       (NOT "processing"); proves an unverifiable callback cannot produce
 *       a fulfillment-ready record even when the push is ours.
 *   (g) Daraja unavailable + no initiation → rejected.
 *   (h) Daraja confirms + initiation present, no existing order → "processing" recovery.
 *   (i) Daraja confirms + initiation present, duplicate concurrent callbacks →
 *       exactly one recovery order (Promise.all concurrency).
 *   (j) Existing pending order advanced atomically (two concurrent → advance once).
 *   (k) Already-processing order with duplicate callback → safe no-op.
 *   (l) Malformed / empty body → acked gracefully.
 *
 * The Daraja token and query endpoints are stubbed via globalThis.fetch.
 * DB interactions use the real provisioned DATABASE_URL (same as other API tests).
 *
 * Run with: pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { db, ucOrdersTable, mpesaStkInitiationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Shared state ──────────────────────────────────────────────────────────────
let realFetch: typeof globalThis.fetch;
let server: http.Server;

// Unique prefix so parallel/repeated test runs don't collide on payment refs.
const TEST_PREFIX = `CB_${Date.now()}`;
let seq = 0;
const nextRef = () => `${TEST_PREFIX}_${++seq}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postCallback(
  body: unknown,
  srv: http.Server = server,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const addr = srv.address() as { port: number };
  const res = await realFetch(
    `http://localhost:${addr.port}/api/payments/mpesa/callback`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    },
  );
  let parsed: Record<string, unknown> = {};
  try { parsed = (await res.json()) as Record<string, unknown>; } catch { /* leave empty */ }
  return { status: res.status, body: parsed };
}

function stkPayload(
  checkoutRequestId: string,
  resultCode = 0,
  amount    = 5000,
  phone     = "254712345678",
  receipt   = "LGR7TEST001",
): unknown {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: `MR-${checkoutRequestId}`,
        CheckoutRequestID: checkoutRequestId,
        ResultCode:        resultCode,
        ResultDesc:        resultCode === 0
          ? "The service request is processed successfully."
          : "Request cancelled by user",
        ...(resultCode === 0
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: "Amount",             Value: amount },
                  { Name: "MpesaReceiptNumber", Value: receipt },
                  { Name: "Balance" },
                  { Name: "TransactionDate",    Value: 20260811120000 },
                  { Name: "PhoneNumber",        Value: Number(phone) },
                ],
              },
            }
          : {}),
      },
    },
  };
}

/**
 * Stubs globalThis.fetch for Daraja endpoints.
 * @param queryResultCode  "0" = confirmed, any other string = rejected,
 *                         null = throw ECONNREFUSED (Daraja unavailable)
 * Returns a restore function.
 */
function stubDaraja(queryResultCode: string | null): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url: unknown, _init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/oauth/v1/generate")) {
      if (queryResultCode === null) throw new Error("ECONNREFUSED (stub token)");
      return new Response(JSON.stringify({ access_token: "stub_token" }), { status: 200 });
    }
    if (u.includes("/stkpushquery")) {
      if (queryResultCode === null) throw new Error("ECONNREFUSED (stub query)");
      const body = queryResultCode === "0"
        ? { ResultCode: "0", ResultDesc: "The service request is processed successfully." }
        : { errorCode: "404.001.04", errorMessage: "Transaction not found" };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    // Resend or any other HTTP call — accept silently
    return new Response(JSON.stringify({ id: "stub_resend" }), { status: 200 });
  };
  return () => { globalThis.fetch = orig; };
}

/** Insert a valid initiation record for a given ref. */
async function insertInitiation(
  checkoutRequestId: string,
  expectedAmount = 5000,
  phone = "254712345678",
  expiresInMs = 15 * 60 * 1000,
): Promise<void> {
  await db.insert(mpesaStkInitiationsTable).values({
    checkoutRequestId,
    expectedAmount,
    phone,
    expiresAt: new Date(Date.now() + expiresInMs),
  }).onConflictDoNothing();
}

/** Remove test rows by prefix so tests are idempotent on re-runs. */
async function cleanTestRows(): Promise<void> {
  const orderRows = await db
    .select({ id: ucOrdersTable.id, ref: ucOrdersTable.paymentReference })
    .from(ucOrdersTable);
  for (const r of orderRows.filter((x) => x.ref?.startsWith(TEST_PREFIX))) {
    await db.delete(ucOrdersTable).where(eq(ucOrdersTable.id, r.id));
  }
  const initiationRows = await db
    .select({ id: mpesaStkInitiationsTable.id, ref: mpesaStkInitiationsTable.checkoutRequestId })
    .from(mpesaStkInitiationsTable);
  for (const r of initiationRows.filter((x) => x.ref.startsWith(TEST_PREFIX))) {
    await db.delete(mpesaStkInitiationsTable).where(eq(mpesaStkInitiationsTable.id, r.id));
  }
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

before(async () => {
  realFetch = globalThis.fetch;

  // Fake Daraja credentials activate the verification branch.
  process.env["MPESA_SHORTCODE"]       ??= "174379";
  process.env["MPESA_PASSKEY"]         ??= "test_passkey";
  process.env["MPESA_CONSUMER_KEY"]    ??= "test_key";
  process.env["MPESA_CONSUMER_SECRET"] ??= "test_secret";
  process.env["SESSION_SECRET"]        ??= "test-secret-mpesa-callback";
  process.env["RESEND_BASE_URL"]       ??= "https://api.resend.com";
  process.env["RESEND_API_KEY"]        ??= "re_test_key";

  const { default: app } = await import("../app.js");
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (err?: Error) =>
      err ? reject(err) : resolve(),
    );
  });
});

after(async () => {
  await cleanTestRows().catch(() => {});
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  globalThis.fetch = realFetch;
});

// ── (a) Non-zero ResultCode → no DB action ───────────────────────────────────

describe("M-Pesa callback — non-zero ResultCode", () => {
  it("acks without orderId and creates no DB row", async () => {
    const restore = stubDaraja("0");
    try {
      const ref = nextRef();
      const { status, body } = await postCallback(stkPayload(ref, 1032));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0, "Safaricom always receives ResultCode 0");
      assert.ok(!("orderId"   in body), "no orderId for a failed payment");
      assert.ok(!("recovered" in body), "no recovered flag");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 0, "no DB row for a failed payment");
    } finally { restore(); }
  });
});

// ── (b) Missing CheckoutRequestID → no DB action ─────────────────────────────

describe("M-Pesa callback — missing CheckoutRequestID", () => {
  it("acks gracefully when CheckoutRequestID is absent", async () => {
    const restore = stubDaraja("0");
    try {
      const { status, body } = await postCallback({
        Body: { stkCallback: { ResultCode: 0, ResultDesc: "Success" } },
      });
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.ok(!("orderId" in body), "no orderId without a checkout reference");
    } finally { restore(); }
  });
});

// ── (c) Daraja rejects → no DB action ───────────────────────────────────────

describe("M-Pesa callback — Daraja verification rejects (forged/replayed callback)", () => {
  it("acks but creates no DB row when Daraja returns a non-0 ResultCode", async () => {
    const restore = stubDaraja("1032");   // rejected / unknown reference
    try {
      const ref = nextRef();
      await insertInitiation(ref);  // initiation exists but Daraja still rejects
      const { status, body } = await postCallback(stkPayload(ref));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0, "Safaricom always receives ResultCode 0");
      assert.ok(!("orderId"   in body), "no orderId — Daraja rejected");
      assert.ok(!("recovered" in body), "no recovered flag");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 0, "a Daraja-rejected callback must not create any DB row");
    } finally { restore(); }
  });
});

// ── (d) Unknown CheckoutRequestID (no initiation record) → rejected ──────────
// Critical anti-fraud: a valid payment to our shortcode that we did not
// initiate must never create or advance an order in our system.

describe("M-Pesa callback — unknown CheckoutRequestID (no initiation record)", () => {
  it("rejects recovery creation even when Daraja confirms — no initiation record", async () => {
    const restore = stubDaraja("0");  // Daraja says payment is real
    try {
      const ref = nextRef();
      // NO initiation record inserted — simulates a CheckoutRequestID we never sent

      const { status, body } = await postCallback(stkPayload(ref, 0, 9999, "254799999999", "FOREIGN_01"));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0, "always ack Safaricom");
      assert.ok(!("orderId"   in body), "no orderId — no initiation record");
      assert.ok(!("recovered" in body), "no recovered flag");
      assert.ok(!("unverified" in body), "no unverified flag");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(
        rows.length, 0,
        "a CheckoutRequestID with no initiation record must NEVER create an order, even if Daraja confirms it — this prevents an attacker with a foreign payment reference from triggering fulfilment",
      );
    } finally { restore(); }
  });
});

// ── (e) Expired initiation record → rejected ─────────────────────────────────

describe("M-Pesa callback — expired initiation record", () => {
  it("rejects a callback when the initiation has expired (replay protection)", async () => {
    const restore = stubDaraja("0");
    try {
      const ref = nextRef();
      // Insert with expiresAt in the past
      await insertInitiation(ref, 5000, "254712345678", -1000); // expired 1 second ago

      const { status, body } = await postCallback(stkPayload(ref));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.ok(!("orderId" in body), "no orderId for an expired initiation");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 0, "expired initiation must not create an order");
    } finally { restore(); }
  });
});

// ── (f) Daraja unavailable + initiation present → "pending" (not "processing") ─
// Key invariant: unverifiable callback cannot produce a fulfillment-ready order.

describe("M-Pesa callback — Daraja unavailable, initiation present", () => {
  it("stores order as 'pending' (NOT 'processing') when Daraja is unreachable", async () => {
    const restore = stubDaraja(null);   // token + query both throw ECONNREFUSED
    const ref = nextRef();
    await insertInitiation(ref, 3500, "254712000001");
    try {
      const { status, body } = await postCallback(stkPayload(ref, 0, 9999, "254799000000", "TAMPERED"));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);

      assert.ok("orderId"   in body, "orderId must be present so the record is traceable");
      assert.equal(body["unverified"], true, "unverified flag must be set");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 1, "exactly one unverified order should be created");
      assert.equal(
        rows[0]!.status,
        "pending",
        "status must be 'pending' — NOT 'processing' — an unverifiable callback must not produce a fulfillment-ready record",
      );
      assert.equal(rows[0]!.webhookRecovery, true);
      // Amount must come from our initiation record, not the tampered callback
      assert.equal(rows[0]!.total, "3500", "total must use our stored initiation amount, not callback amount");
    } finally { restore(); }
  });

  it("leaves an existing pending order unchanged when Daraja is unreachable", async () => {
    const restore = stubDaraja(null);
    const ref = nextRef();
    await insertInitiation(ref, 5000, "254712000002");

    const [inserted] = await db
      .insert(ucOrdersTable)
      .values({
        userId:           "cust@example.com",
        status:           "pending",
        total:            "5000",
        currency:         "KES",
        paymentMethod:    "mpesa",
        paymentReference: ref,
        promoCode:        "",
        discountPercent:  0,
        discountAmount:   0,
        shippingAddress:  {},
      })
      .returning();

    try {
      const { status, body } = await postCallback(stkPayload(ref));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.equal(body["orderId"], inserted!.id);
      assert.equal(body["unverified"], true);

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows[0]!.status, "pending", "existing pending order must NOT be advanced without Daraja confirmation");
    } finally { restore(); }
  });
});

// ── (g) Daraja unavailable + no initiation → rejected ────────────────────────

describe("M-Pesa callback — Daraja unavailable, no initiation record", () => {
  it("rejects recovery creation when both Daraja and initiation record are absent", async () => {
    const restore = stubDaraja(null);  // Daraja unavailable
    const ref = nextRef();
    // No initiation record — we never initiated this push
    try {
      const { status, body } = await postCallback(stkPayload(ref));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.ok(!("orderId" in body), "no orderId — neither Daraja nor initiation can confirm ownership");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 0, "no order must be created when neither Daraja nor initiation record confirms the push is ours");
    } finally { restore(); }
  });
});

// ── (h) Daraja confirms + initiation → "processing" recovery ─────────────────

describe("M-Pesa callback — Daraja confirms, initiation present, no existing order", () => {
  it("creates a 'processing' recovery using initiation amount (not callback amount)", async () => {
    const restore = stubDaraja("0");
    const ref = nextRef();
    // Initiation says 7500; callback claims 9999 (tampered)
    await insertInitiation(ref, 7500, "254722000002");
    try {
      const { status, body } = await postCallback(stkPayload(ref, 0, 9999, "254722000002", "LTEST004"));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.ok(typeof body["orderId"] === "number", "orderId must be a number");
      assert.equal(body["recovered"], true);
      assert.ok(!("unverified" in body), "no unverified flag when Daraja confirmed");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 1, "exactly one recovery order");
      assert.equal(rows[0]!.status,          "processing", "Daraja-confirmed recovery must be 'processing'");
      assert.equal(rows[0]!.paymentMethod,   "mpesa");
      assert.equal(rows[0]!.total,           "7500",        "must use initiation amount (7500), not tampered callback amount (9999)");
      assert.equal(rows[0]!.webhookRecovery, true);
    } finally { restore(); }
  });
});

// ── (i) Concurrent confirmed callbacks → only one recovery order ──────────────

describe("M-Pesa callback — concurrent duplicate confirmed callbacks", () => {
  it("two simultaneous callbacks create exactly one recovery order", async () => {
    const restore = stubDaraja("0");
    const ref = nextRef();
    await insertInitiation(ref, 4200, "254733000003");
    try {
      const [first, second] = await Promise.all([
        postCallback(stkPayload(ref, 0, 4200, "254733000003", "LTEST005")),
        postCallback(stkPayload(ref, 0, 4200, "254733000003", "LTEST005")),
      ]);
      assert.equal(first.status,  200, "first callback must ack");
      assert.equal(second.status, 200, "second callback must ack");
      assert.equal(first.body["ResultCode"],  0);
      assert.equal(second.body["ResultCode"], 0);

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 1, "concurrent callbacks must not create duplicate recovery orders");
      assert.equal(rows[0]!.status, "processing");
    } finally { restore(); }
  });
});

// ── (j) Existing pending order advanced atomically ────────────────────────────

describe("M-Pesa callback — existing pending order (app closed during wait)", () => {
  it("advances pending → processing when Daraja confirms", async () => {
    const restore = stubDaraja("0");
    const ref = nextRef();
    await insertInitiation(ref, 9900, "254712345679");

    const [inserted] = await db
      .insert(ucOrdersTable)
      .values({
        userId:           "amina@example.com",
        status:           "pending",
        total:            "9900",
        currency:         "KES",
        paymentMethod:    "mpesa",
        paymentReference: ref,
        promoCode:        "",
        discountPercent:  0,
        discountAmount:   0,
        shippingAddress:  { firstName: "Amina", city: "Nairobi" },
      })
      .returning();

    try {
      const { status, body } = await postCallback(stkPayload(ref, 0, 9900, "254712345679", "LTEST006"));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.equal(body["orderId"], inserted!.id, "orderId must match the existing order");
      assert.ok(!("recovered" in body) || body["recovered"] !== true, "not a new recovery order");

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 1, "only one order row");
      assert.equal(rows[0]!.status, "processing", "pending order must be advanced to processing");
    } finally { restore(); }
  });

  it("two simultaneous callbacks on the same pending order advance it exactly once", async () => {
    const restore = stubDaraja("0");
    const ref = nextRef();
    await insertInitiation(ref, 6600, "254700000010");

    const [inserted] = await db
      .insert(ucOrdersTable)
      .values({
        userId:           "concurrent@example.com",
        status:           "pending",
        total:            "6600",
        currency:         "KES",
        paymentMethod:    "mpesa",
        paymentReference: ref,
        promoCode:        "",
        discountPercent:  0,
        discountAmount:   0,
        shippingAddress:  {},
      })
      .returning();

    try {
      const [first, second] = await Promise.all([
        postCallback(stkPayload(ref, 0, 6600, "254700000010", "LTEST007")),
        postCallback(stkPayload(ref, 0, 6600, "254700000010", "LTEST007")),
      ]);
      assert.equal(first.status,  200);
      assert.equal(second.status, 200);
      assert.equal(first.body["orderId"],  inserted!.id);
      assert.equal(second.body["orderId"], inserted!.id);

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows.length, 1, "one order, not two");
      assert.equal(rows[0]!.status, "processing", "must have been advanced");
    } finally { restore(); }
  });
});

// ── (k) Already-processing order → safe no-op ────────────────────────────────

describe("M-Pesa callback — already-processing order (duplicate)", () => {
  it("duplicate callback on a processing order is a no-op", async () => {
    const restore = stubDaraja("0");
    const ref = nextRef();
    await insertInitiation(ref, 3300, "254722000004");

    const [inserted] = await db
      .insert(ucOrdersTable)
      .values({
        userId:           "customer2@example.com",
        status:           "processing",
        total:            "3300",
        currency:         "KES",
        paymentMethod:    "mpesa",
        paymentReference: ref,
        promoCode:        "",
        discountPercent:  0,
        discountAmount:   0,
        shippingAddress:  {},
      })
      .returning();

    try {
      const { status, body } = await postCallback(stkPayload(ref, 0, 3300, "254722000004", "LTEST008"));
      assert.equal(status, 200);
      assert.equal(body["ResultCode"], 0);
      assert.equal(body["orderId"], inserted!.id);

      const rows = await db.select().from(ucOrdersTable).where(eq(ucOrdersTable.paymentReference, ref));
      assert.equal(rows[0]!.status, "processing", "already-processing order stays processing");
    } finally { restore(); }
  });
});

// ── (l) Malformed / empty body → acked gracefully ────────────────────────────

describe("M-Pesa callback — malformed body", () => {
  it("acks gracefully when Body.stkCallback is absent", async () => {
    const { status, body } = await postCallback({});
    assert.equal(status, 200);
    assert.equal(body["ResultCode"], 0);
  });
});

// ── (m) DB insert failure → STK push endpoint returns 500 (no CheckoutRequestID) ─
// Guards against the scenario where the DB is unavailable exactly when the
// initiation record should be written.  Without the record the callback cannot
// recover the payment; we must therefore refuse to issue a usable
// CheckoutRequestID rather than silently stranding the customer's payment.

describe("M-Pesa initiation — DB insert failure", () => {
  it("returns 500 without a CheckoutRequestID when the initiation DB insert fails", async () => {
    // Remove Daraja credentials so the endpoint uses the sandbox branch,
    // which does the insert BEFORE any external call — cleanest surface to intercept.
    const savedKey    = process.env["MPESA_CONSUMER_KEY"];
    const savedSecret = process.env["MPESA_CONSUMER_SECRET"];
    const savedShort  = process.env["MPESA_SHORTCODE"];
    const savedPass   = process.env["MPESA_PASSKEY"];
    delete process.env["MPESA_CONSUMER_KEY"];
    delete process.env["MPESA_CONSUMER_SECRET"];
    delete process.env["MPESA_SHORTCODE"];
    delete process.env["MPESA_PASSKEY"];

    // Override db.insert on the shared singleton to throw once.
    const { db: dbInstance } = await import("@workspace/db");
    const origInsert = dbInstance.insert.bind(dbInstance);
    let failTriggered = false;
    (dbInstance as unknown as Record<string, unknown>)["insert"] = function (...args: unknown[]) {
      if (!failTriggered) {
        failTriggered = true;
        throw new Error("DB write unavailable (simulated for test)");
      }
      return (origInsert as (...a: unknown[]) => unknown)(...args);
    };

    try {
      const addr = (server.address() as { port: number });
      const res = await realFetch(
        `http://localhost:${addr.port}/api/payments/mpesa`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ phone: "0712300000", amount: 5000, orderId: "DB-FAIL-TEST" }),
        },
      );
      const body = await res.json() as Record<string, unknown>;

      assert.equal(res.status, 500, "endpoint must return 500 when initiation DB insert fails");
      assert.ok(body["error"],        "error message must be present");
      assert.equal(body["retryable"], true, "client must be told to retry");
      assert.ok(!("checkoutRequestId" in body), "no CheckoutRequestID must be issued — without the record the callback cannot recover payment");
    } finally {
      // Restore insert and credentials
      (dbInstance as unknown as Record<string, unknown>)["insert"] = origInsert;
      if (savedKey)    process.env["MPESA_CONSUMER_KEY"]    = savedKey;
      if (savedSecret) process.env["MPESA_CONSUMER_SECRET"] = savedSecret;
      if (savedShort)  process.env["MPESA_SHORTCODE"]       = savedShort;
      if (savedPass)   process.env["MPESA_PASSKEY"]         = savedPass;
    }
  });
});

// ── (n) Full round-trip: POST /payments/mpesa → initiation stored → callback ─
// This test exercises the real POST /payments/mpesa endpoint in sandbox mode
// (no Daraja credentials active), verifies the initiation record is persisted,
// then fires the callback and confirms a 'processing' recovery order is created.
// It validates the deployed schema path: the table must exist before any STK
// push is accepted; if the migration was never applied this test will fail.

describe("M-Pesa callback — full round-trip (sandbox)", () => {
  it("POST /payments/mpesa stores initiation; callback creates recovery using initiation amount", async () => {
    const restore = stubDaraja("0");

    // Ensure Daraja credentials are ABSENT so the endpoint uses sandbox mode.
    const savedKey    = process.env["MPESA_CONSUMER_KEY"];
    const savedSecret = process.env["MPESA_CONSUMER_SECRET"];
    const savedShort  = process.env["MPESA_SHORTCODE"];
    const savedPass   = process.env["MPESA_PASSKEY"];
    delete process.env["MPESA_CONSUMER_KEY"];
    delete process.env["MPESA_CONSUMER_SECRET"];
    delete process.env["MPESA_SHORTCODE"];
    delete process.env["MPESA_PASSKEY"];

    try {
      const addr = (server.address() as { port: number });

      // ── Step 1: initiate the STK push via the real endpoint ──────────────
      const stkRes = await realFetch(
        `http://localhost:${addr.port}/api/payments/mpesa`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ phone: "0712345999", amount: 8800, orderId: "TEST-RT-1" }),
        },
      );
      assert.equal(stkRes.status, 200, "STK initiation must return 200");
      const stkBody = (await stkRes.json()) as Record<string, unknown>;
      const checkoutRequestId = stkBody["checkoutRequestId"] as string;
      assert.ok(checkoutRequestId, "response must include checkoutRequestId");

      // ── Step 2: verify the initiation record was persisted ───────────────
      const initiations = await db
        .select()
        .from(mpesaStkInitiationsTable)
        .where(eq(mpesaStkInitiationsTable.checkoutRequestId, checkoutRequestId));
      assert.equal(initiations.length, 1, "initiation record must be stored in DB immediately");
      assert.equal(initiations[0]!.expectedAmount, 8800, "stored amount must match request");
      assert.ok(initiations[0]!.expiresAt > new Date(), "expiry must be in the future");

      // ── Step 3: fire the callback and verify a recovery order is created ─
      // Restore Daraja env so verification runs (stubs handle the actual calls).
      process.env["MPESA_CONSUMER_KEY"]    = "test_key";
      process.env["MPESA_CONSUMER_SECRET"] = "test_secret";
      process.env["MPESA_SHORTCODE"]       = "174379";
      process.env["MPESA_PASSKEY"]         = "test_passkey";

      const cbRes = await postCallback(stkPayload(checkoutRequestId, 0, 9999, "254712345999", "LRT001"));
      assert.equal(cbRes.status, 200);
      assert.equal(cbRes.body["ResultCode"], 0);
      assert.ok(typeof cbRes.body["orderId"] === "number", "orderId must be returned");
      assert.equal(cbRes.body["recovered"], true);

      // ── Step 4: verify the recovery order uses our initiated amount ───────
      const orders = await db
        .select()
        .from(ucOrdersTable)
        .where(eq(ucOrdersTable.paymentReference, checkoutRequestId));
      assert.equal(orders.length, 1, "exactly one recovery order");
      assert.equal(orders[0]!.status, "processing");
      assert.equal(orders[0]!.total, "8800", "must use initiation amount (8800), not tampered callback amount (9999)");
      assert.equal(orders[0]!.webhookRecovery, true);
    } finally {
      // Restore env vars
      if (savedKey)    process.env["MPESA_CONSUMER_KEY"]    = savedKey;
      if (savedSecret) process.env["MPESA_CONSUMER_SECRET"] = savedSecret;
      if (savedShort)  process.env["MPESA_SHORTCODE"]       = savedShort;
      if (savedPass)   process.env["MPESA_PASSKEY"]         = savedPass;
      restore();
    }
  });
});
