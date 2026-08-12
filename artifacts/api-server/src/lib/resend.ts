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
 *
 * Every send attempt is written non-blocking to uc_notification_log.
 * A DB write failure here never affects the caller.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, ucNotificationLogTable } from "@workspace/db";

const connectors = new ReplitConnectors();

export interface ResendEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Optional metadata stored in the notification log. Not sent to Resend. */
  meta?: {
    template?: string;
    orderId?:  number | string;
    ticketId?: string;
    testId?:   string;
  };
}

/** Write a send-attempt row to uc_notification_log. Never throws. */
function logResendAttempt(params: {
  recipient:    string;
  template:     string;
  messageBody:  string;
  orderId?:     number | string;
  ticketId?:    string;
  testId?:      string;
  status:       "sent" | "failed";
  errorMessage?: string;
}): void {
  db.insert(ucNotificationLogTable)
    .values({
      channel:      "email",
      provider:     "resend",
      recipient:    params.recipient,
      template:     params.template,
      messageBody:  params.messageBody,
      orderId:      params.orderId != null ? Number(params.orderId) : undefined,
      ticketId:     params.ticketId,
      testId:       params.testId,
      status:       params.status,
      errorMessage: params.errorMessage,
    })
    .catch((err: unknown) => {
      console.error("[resend] notification log write failed:", err);
    });
}

export async function sendViaResend(email: ResendEmail): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const baseUrl = process.env["RESEND_BASE_URL"];

  // Strip the meta field before sending — Resend API doesn't know about it.
  const { meta, ...resendPayload } = email;
  // Store the full plain-text body so retries can reconstruct a useful message.
  const logBase = {
    recipient:   email.to,
    template:    meta?.template ?? "",
    messageBody: email.text,
    orderId:     meta?.orderId,
    ticketId:    meta?.ticketId,
    testId:      meta?.testId,
  };

  try {
    let resp: Response;
    if (apiKey || baseUrl) {
      resp = await fetch(`${baseUrl ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey ?? ""}` },
        body: JSON.stringify(resendPayload),
      });
    } else {
      resp = await connectors.proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resendPayload),
      });
    }
    if (resp.ok) {
      logResendAttempt({ ...logBase, status: "sent" });
      return true;
    }
    // Log only the status and Resend's error name — never the raw response
    // body, which may echo request fields containing customer PII.
    let errName = "";
    try {
      const parsed = (await resp.json()) as { name?: string };
      if (typeof parsed?.name === "string") errName = ` (${parsed.name})`;
    } catch { /* body not JSON — ignore */ }
    const errMsg = `Resend ${resp.status}${errName}`;
    console.error(`[resend] ${errMsg} for "${email.subject}"`);
    logResendAttempt({ ...logBase, status: "failed", errorMessage: errMsg });
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resend] send failed for "${email.subject}":`, msg);
    logResendAttempt({ ...logBase, status: "failed", errorMessage: `Network error: ${msg}` });
    return false;
  }
}
