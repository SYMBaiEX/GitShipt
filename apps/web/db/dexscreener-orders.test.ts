import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dexscreenerOrders } from "@/db/schema";

const migration = readFileSync(
  join(process.cwd(), "db/migrations/0021_dexscreener_orders.sql"),
  "utf8",
);

describe("0021_dexscreener_orders migration", () => {
  it("creates the dexscreener_order_status enum with all five states", () => {
    expect(migration).toMatch(
      /CREATE TYPE\s+"public"\."dexscreener_order_status"\s+AS ENUM/,
    );
    for (const v of ["pending", "broadcast", "paid", "failed", "stub_paid"]) {
      expect(migration).toContain(`'${v}'`);
    }
  });

  it("declares the dexscreener_orders table with cascading project FK", () => {
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "dexscreener_orders"`);
    expect(migration).toMatch(
      /FOREIGN KEY\s+\("project_id"\)\s+REFERENCES\s+"projects"\("id"\)\s+ON DELETE CASCADE/,
    );
  });

  it("enforces unique order_uuid and partial unique index for active orders", () => {
    expect(migration).toContain(`"dexscreener_orders_order_uuid_unique"`);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS\s+"dexscreener_orders_project_active_unique"[\s\S]+WHERE\s+"status"\s+IN\s+\('pending',\s*'broadcast',\s*'paid',\s*'stub_paid'\)/,
    );
  });
});

describe("dexscreenerOrders schema (drizzle)", () => {
  it("exposes a row type with the expected lifecycle columns", () => {
    type Row = typeof dexscreenerOrders.$inferSelect;
    const sample: Row = {
      id: "dso_x",
      projectId: "proj_x",
      tokenMint: "Mint11",
      orderUuid: "order-1",
      recipientWallet: "Recv11",
      payerWallet: "Pay11",
      priceUsdc: "299.00",
      payWithSol: false,
      description: "d",
      iconImageUrl: "https://example.com/i.png",
      headerImageUrl: "https://example.com/h.png",
      links: [{ url: "https://example.com" }],
      lastValidBlockHeight: 1,
      bagsTransactionBlob: null,
      paymentSignature: null,
      status: "pending",
      stub: false,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: null,
    };
    expect(sample.status).toBe("pending");
  });
});
