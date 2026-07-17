/**
 * Regression tests for WooCommerce login principal identity.
 *
 * Previously the Woo success path minted every JWT with a hardcoded `id: 1`,
 * collapsing all Woo-authenticated users into one principal — and colliding
 * with uc_users serial id 1 (identity confusion / potential privilege
 * escalation via the DB-anchored admin check).
 *
 * Now each Woo login derives a stable per-email principal id offset by 1e9 so
 * it can never collide with a DB serial id. Verifies:
 *   1. Two distinct Woo users get distinct principal ids, both >= 1e9.
 *   2. The same Woo user gets the SAME id across logins (stable identity).
 *   3. A Woo-authenticated token is denied on /uc/admin/* routes.
 *   4. Profile resolution for a Woo token never reports isAdmin: true.
 *
 * Run with: pnpm --filter @workspace/api-server test
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// ── Stub WordPress JWT endpoint ──────────────────────────────────────────────
// Mimics the wp-json/jwt-auth/v1/token response shape; echoes the username
// back as user_email like the real plugin does.
let wooStub: http.Server;
let server: http.Server;

before(async () => {
  process.env["SESSION_SECRET"] ??= "test-secret-for-woo-principal-tests";

  wooStub = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/wp-json/jwt-auth/v1/token") {
      let raw = "";
      req.on("data", c => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw) as { username?: string };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          token: "stub-wc-token",
          user_email: body.username ?? "",
          user_nicename: "stub",
          user_display_name: "Stub Customer",
        }));
      });
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve, reject) => {
    wooStub.listen(0, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
  });
  const stubAddr = wooStub.address() as { port: number };
  process.env["WC_BASE_URL"] = `http://127.0.0.1:${stubAddr.port}`;

  const { default: app } = await import("../app.js");
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (err?: Error) => (err ? reject(err) : resolve()));
  });
});

after(async () => {
  delete process.env["WC_BASE_URL"];
  await new Promise<void>((resolve, reject) => server.close(e => (e ? reject(e) : resolve())));
  await new Promise<void>((resolve, reject) => wooStub.close(e => (e ? reject(e) : resolve())));
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: unknown }> {
  const addr = server.address() as { port: number };
  const res = await fetch(`http://localhost:${addr.port}${path}`, init);
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function wooLogin(email: string): Promise<{ token: string; user: { id: number; email: string } }> {
  const r = await apiFetch("/api/uc/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "woo-account-password" }),
  });
  assert.equal(r.status, 200, `login should succeed via Woo stub, got ${r.status}`);
  return r.body as { token: string; user: { id: number; email: string } };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("WooCommerce login principal identity", () => {
  it("gives two distinct Woo users distinct principal ids, both >= 1e9", async () => {
    const a = await wooLogin("woo-alice@example.com");
    const b = await wooLogin("woo-bob@example.com");
    assert.notEqual(a.user.id, b.user.id, "distinct users must not share a principal id");
    assert.ok(a.user.id >= 1_000_000_000, "Woo principal id must be >= 1e9 (non-DB range)");
    assert.ok(b.user.id >= 1_000_000_000, "Woo principal id must be >= 1e9 (non-DB range)");
    assert.notEqual(a.user.id, 1, "must not be the legacy hardcoded id 1");
  });

  it("gives the same Woo user the same principal id across logins", async () => {
    const first = await wooLogin("woo-stable@example.com");
    const second = await wooLogin("woo-stable@example.com");
    assert.equal(first.user.id, second.user.id, "principal id must be stable per email");
  });

  it("denies a Woo-authenticated token on /uc/admin/* routes", async () => {
    const { token } = await wooLogin("woo-nonadmin@example.com");
    const r = await apiFetch("/api/uc/admin/products/1/media", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: "/objects/uploads/does-not-matter", kind: "photo" }),
    });
    assert.ok(
      r.status === 401 || r.status === 403,
      `admin route must deny Woo principals, got ${r.status}`
    );
  });

  it("never reports isAdmin: true for a Woo-authenticated profile", async () => {
    const { token } = await wooLogin("woo-profile@example.com");
    const r = await apiFetch("/api/uc/customer/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(r.status, 200);
    const profile = r.body as { isAdmin?: boolean };
    assert.notEqual(profile.isAdmin, true, "Woo principal must never resolve as admin");
  });
});
