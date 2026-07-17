import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Persists water test booking requests from the UC Companion app.
 */
export const ucWaterTestsTable = pgTable("uc_water_tests", {
  id:          text("id").primaryKey(),              // "WT-<timestamp>"
  userId:      text("user_id").notNull(),
  name:        text("name").notNull(),
  address:     text("address").notNull(),
  phone:       text("phone").notNull(),
  waterSource: text("water_source").notNull().default("Municipal"),
  concerns:    text("concerns").notNull().default(""),
  status:      text("status").notNull().default("pending"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UcWaterTest = typeof ucWaterTestsTable.$inferSelect;
