import {
  pgEnum,
  pgTable,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@repo/lib";
import { projects } from "./projects";

export const dexscreenerOrderStatusEnum = pgEnum("dexscreener_order_status", [
  "pending",
  "broadcast",
  "paid",
  "failed",
  "stub_paid",
]);

export interface DexscreenerOrderLink {
  url: string;
  label?: string;
}

export const dexscreenerOrders = pgTable(
  "dexscreener_orders",
  (t) => ({
    id: t
      .text("id")
      .primaryKey()
      .$defaultFn(() => createId("dso")),
    projectId: t
      .text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenMint: t.text("token_mint").notNull(),
    orderUuid: t.text("order_uuid").notNull(),
    recipientWallet: t.text("recipient_wallet").notNull(),
    payerWallet: t.text("payer_wallet").notNull(),
    priceUsdc: numeric("price_usdc", { precision: 12, scale: 2 }).notNull(),
    payWithSol: boolean("pay_with_sol").notNull().default(false),
    description: t.text("description").notNull(),
    iconImageUrl: t.text("icon_image_url").notNull(),
    headerImageUrl: t.text("header_image_url").notNull(),
    links: jsonb("links")
      .$type<DexscreenerOrderLink[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastValidBlockHeight: integer("last_valid_block_height").notNull(),
    bagsTransactionBlob: t.text("bags_transaction_blob"),
    paymentSignature: t.text("payment_signature"),
    status: dexscreenerOrderStatusEnum("status").notNull().default("pending"),
    stub: boolean("stub").notNull().default(false),
    errorMessage: t.text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  }),
  (table) => ({
    orderUuidUnique: uniqueIndex("dexscreener_orders_order_uuid_unique").on(
      table.orderUuid,
    ),
    projectActiveUnique: uniqueIndex(
      "dexscreener_orders_project_active_unique",
    )
      .on(table.projectId)
      .where(
        sql`${table.status} IN ('pending','broadcast','paid','stub_paid')`,
      ),
    projectCreated: index("dexscreener_orders_project_created_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
  }),
);

export type DexscreenerOrderRow = typeof dexscreenerOrders.$inferSelect;
export type NewDexscreenerOrder = typeof dexscreenerOrders.$inferInsert;
