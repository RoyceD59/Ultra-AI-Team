/**
 * Africa's Talking SMS helper for Ultra-Clear Companion.
 *
 * Reads AT_API_KEY and AT_USERNAME from the environment.
 * All calls are fire-and-forget — errors are logged but never thrown.
 * When credentials are absent the function is a silent no-op.
 *
 * Africa's Talking SMS API docs:
 * https://developers.africastalking.com/docs/sms/sending
 */

const AT_BASE = "https://api.africastalking.com/version1/messaging";

/** Returns true when Africa's Talking credentials are present. */
function hasATCredentials(): boolean {
  return !!(process.env["AT_API_KEY"] && process.env["AT_USERNAME"]);
}

/**
 * Normalise a phone number to international format for Africa's Talking.
 * AT requires numbers in E.164, e.g. +254712345678.
 * Strips spaces; converts leading 07/01 Kenyan numbers to +2547/+2541.
 */
function normalisePhone(raw: string): string {
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+")) return stripped;
  if (stripped.startsWith("07") || stripped.startsWith("01")) {
    return "+254" + stripped.slice(1);
  }
  return stripped;
}

/**
 * Send an SMS via Africa's Talking (fire-and-forget).
 *
 * @param to      Recipient phone number (international or Kenyan local format)
 * @param message SMS body (max 160 chars for single-part; longer auto-splits)
 */
export async function sendSms(to: string, message: string): Promise<void> {
  if (!hasATCredentials()) {
    console.log("[sms] AT credentials absent — skipping SMS to", to);
    return;
  }

  const phone = normalisePhone(to);
  if (!phone) {
    console.warn("[sms] Cannot normalise phone number:", to);
    return;
  }

  const apiKey   = process.env["AT_API_KEY"]!;
  const username = process.env["AT_USERNAME"]!;

  // Fire and forget — do NOT await at the call site
  fetch(AT_BASE, {
    method: "POST",
    headers: {
      "Accept":       "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "apiKey":       apiKey,
    },
    body: new URLSearchParams({
      username,
      to: phone,
      message,
      // from: "UCFilters",  // uncomment once your sender ID is approved by AT
    }).toString(),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable)");
        console.error(`[sms] AT returned ${res.status}:`, body);
      } else {
        const data = await res.json().catch(() => null);
        console.log("[sms] sent to", phone, "—", JSON.stringify(data));
      }
    })
    .catch((err: unknown) => {
      console.error("[sms] network error:", err);
    });
}

// ─── Message templates ─────────────────────────────────────────────────────────

export function orderConfirmationSms(params: {
  orderId:   string | number;
  total:     string;
  firstName: string;
}): string {
  return (
    `Hi ${params.firstName}! Your Ultra Clear order #${params.orderId} has been placed. ` +
    `Total: KES ${Number(params.total).toLocaleString("en-KE")}. ` +
    `Track your order in the Ultra Clear app. Thank you for choosing certified clean water!`
  );
}

export function ticketConfirmationSms(params: {
  ticketId:  string;
  firstName: string;
}): string {
  return (
    `Hi ${params.firstName}! Your Ultra Clear maintenance ticket ${params.ticketId} has been submitted. ` +
    `Our team will contact you within 24–48 hours. ` +
    `For urgent help call +254 700 000 000.`
  );
}

export function waterTestConfirmationSms(params: {
  testId:    string;
  address:   string;
  firstName: string;
}): string {
  const shortAddr = params.address.length > 40
    ? params.address.slice(0, 37) + "…"
    : params.address;
  return (
    `Hi ${params.firstName}! Your free Ultra Clear water quality test (ref: ${params.testId}) ` +
    `is booked for ${shortAddr}. ` +
    `We'll call to confirm the appointment time. Questions? Call +254 700 000 000.`
  );
}
