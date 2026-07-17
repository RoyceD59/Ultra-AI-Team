import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores per-user notification opt-out preferences, independent of push token
 * registration. This means a user can set their preferences before granting
 * push permission — prefs are then synced into uc_push_tokens when a token
 * is eventually registered.
 */
export const ucNotifPrefsTable = pgTable("uc_notif_prefs", {
  userId:       text("user_id").primaryKey(),
  optOutOrders: boolean("opt_out_orders").notNull().default(false),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UcNotifPref = typeof ucNotifPrefsTable.$inferSelect;
