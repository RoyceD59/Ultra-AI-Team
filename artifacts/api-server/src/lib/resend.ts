/**
 * Resend email helper.
 *
 * Two delivery modes, checked in order:
 *   1. Direct API — when RESEND_API_KEY is set (or RESEND_BASE_URL, used by
 *      tests to point at a stub server).
 *   2. Replit Resend connector — authenticated proxy, no API key needed.
 *
 * Returns true when Resend accepted the email, false otherwise (caller
 * decides whether to fall back to another provider). Never throws.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export interface ResendEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendViaResend(email: ResendEmail): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const baseUrl = process.env["RESEND_BASE_URL"];
  try {
    let resp: Response;
    if (apiKey || baseUrl) {
      resp = await fetch(`${baseUrl ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey ?? ""}` },
        body: JSON.stringify(email),
      });
    } else {
      resp = await connectors.proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email),
      });
    }
    if (resp.ok) return true;
    // Log only the status and Resend's error name — never the raw response
    // body, which may echo request fields containing customer PII.
    let errName = "";
    try {
      const parsed = (await resp.json()) as { name?: string };
      if (typeof parsed?.name === "string") errName = ` (${parsed.name})`;
    } catch { /* body not JSON — ignore */ }
    console.error(`[resend] ${resp.status}${errName} for "${email.subject}"`);
    return false;
  } catch (err) {
    console.error(`[resend] send failed for "${email.subject}":`, err instanceof Error ? err.message : err);
    return false;
  }
}
