import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores one Expo push token per user.
 * `userId` is the stable string identity extracted from the JWT
 * (the numeric user id or email, whichever is present — see userIdFromBearer).
 *
 * Upserted on every token registration so a re-install or permission reset
 * always overwrites the old token rather than leaving stale rows.
 */
export const ucPushTokensTable = pgTable("uc_push_tokens", {
  userId:     text("user_id").primaryKey(),
  pushToken:  text("push_token").notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UcPushToken = typeof ucPushTokensTable.$inferSelect;
