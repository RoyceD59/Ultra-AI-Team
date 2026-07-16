/**
 * Minimal HMAC-SHA256 ("HS256") JWT utilities.
 *
 * Only used for tokens we issue ourselves (mock login + register paths).
 * WooCommerce tokens are re-wrapped into our format so they are also
 * verifiable by us before use.
 *
 * Uses Node.js built-in `crypto` — no external dependencies.
 */
import { createHmac, timingSafeEqual } from "crypto";

const ALG_HEADER = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");

function secret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) {
    // Warn once; in production the secret must be set.
    console.warn("[jwt] SESSION_SECRET is not set — using insecure fallback");
  }
  return s ?? "dev-insecure-fallback-change-in-production";
}

function sign(headerDotBody: string): string {
  return createHmac("sha256", secret())
    .update(headerDotBody)
    .digest("base64url");
}

/** Issue a signed JWT containing `payload` as the claims. */
export function issueToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `${ALG_HEADER}.${body}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export interface JwtClaims {
  id:        number | string;
  email:     string;
  firstName?: string;
  lastName?:  string;
}

/**
 * Verify a Bearer JWT issued by this server.
 * Returns the decoded claims on success, or null if the signature is invalid,
 * the token is malformed, or the algorithm is `none`.
 */
export function verifyToken(authHeader: string | undefined): JwtClaims | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, givenSig] = parts as [string, string, string];

  // Reject unsigned tokens ("alg": "none")
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: string };
    if (h.alg === "none" || !h.alg) return null;
  } catch {
    return null;
  }

  const expected = sign(`${header}.${body}`);
  // Use timing-safe comparison to prevent timing attacks
  try {
    const a = Buffer.from(expected, "base64url");
    const b = Buffer.from(givenSig, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as JwtClaims;
  } catch {
    return null;
  }
}
