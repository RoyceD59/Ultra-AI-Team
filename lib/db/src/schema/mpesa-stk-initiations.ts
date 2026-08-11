import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Tracks M-Pesa STK pushes initiated by this server.
 *
 * Inserted immediately after Safaricom returns a CheckoutRequestID.
 * The callback handler requires an entry here before creating or advancing
 * any order — this proves the push originated from our application and
 * lets us use our own stored amount rather than trusting callback metadata.
 *
 * Records are kept for audit; expiresAt is the validity window for callback
 * correlation (generous: 15 minutes beyond the 5-minute STK timeout).
 */
export const mpesaStkInitiationsTable = pgTable(
  "mpesa_stk_initiations",
  {
    id:                serial("id").primaryKey(),
    checkoutRequestId: text("checkout_request_id").notNull(),
    /** Expected payment amount in KES (whole units). */
    expectedAmount:    integer("expected_amount").notNull(),
    /** Normalised phone, e.g. "254712345678". */
    phone:             text("phone").notNull(),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Callback is not honoured after this time (replay protection). */
    expiresAt:         timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("mpesa_stk_initiations_checkout_request_id_unique").on(t.checkoutRequestId),
  ],
);

export type MpesaStkInitiation     = typeof mpesaStkInitiationsTable.$inferSelect;
export type NewMpesaStkInitiation  = typeof mpesaStkInitiationsTable.$inferInsert;
