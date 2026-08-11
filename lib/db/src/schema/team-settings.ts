import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const teamSettingsTable = pgTable("team_settings", {
  id: text("id").primaryKey().$defaultFn(() => "singleton"),
  passcodeHash: text("passcode_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamSettings = typeof teamSettingsTable.$inferSelect;
