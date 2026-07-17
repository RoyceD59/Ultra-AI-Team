import { pgTable, serial, integer, text, timestamp, json } from "drizzle-orm/pg-core";

/**
 * Persists orders placed through the UC Companion app.
 * When WooCommerce credentials are present, WC is the system of record and
 * these tables are not used. In mock mode, orders live here.
 */
export const ucOrdersTable = pgTable("uc_orders", {
  id:               serial("id").primaryKey(),
  userId:           text("user_id").notNull(),
  status:           text("status").notNull().default("pending"),
  total:            text("total").notNull(),
  currency:         text("currency").notNull().default("KES"),
  paymentMethod:    text("payment_method").notNull(),
  paymentReference: text("payment_reference").default(""),
  promoCode:        text("promo_code").default(""),
  discountPercent:  integer("discount_percent").notNull().default(0),
  discountAmount:   integer("discount_amount").notNull().default(0),
  shippingAddress:  json("shipping_address").$type<Record<string, string>>(),
  dateCreated:      timestamp("date_created", { withTimezone: true }).notNull().defaultNow(),
});

export const ucOrderItemsTable = pgTable("uc_order_items", {
  id:        serial("id").primaryKey(),
  orderId:   integer("order_id").notNull().references(() => ucOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  name:      text("name").notNull(),
  quantity:  integer("quantity").notNull(),
  total:     text("total").notNull(),
});

export type UcOrder     = typeof ucOrdersTable.$inferSelect;
export type UcOrderItem = typeof ucOrderItemsTable.$inferSelect;
