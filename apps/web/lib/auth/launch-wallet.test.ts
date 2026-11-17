import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { getRlsContext, withRlsContext } from "@/db/rls-context";
import { isWalletBoundToUser } from "./launch-wallet";

vi.mock("server-only", () => ({}));
const select = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ dbHttp: { select: () => ({ from: () => ({
  where: (query: unknown) => ({ limit: () => select(query) }),
}) }) } }));

describe("launch wallet binding", () => {
  it("checks the exact Solana address as the signed-in user, not as admin", async () => {
    select.mockImplementation(async (query) => {
      await Promise.resolve();
      expect(getRlsContext()).toMatchObject({
        mode: "user", userId: "owner", role: "user",
      });
      const { params } = new PgDialect().sqlToQuery(query);
      expect(params).toEqual(["owner", "wallet-address", "solana"]);
      return [{ id: "verified" }];
    });
    await withRlsContext({ mode: "service", reason: "test" }, async () => {
      expect(await isWalletBoundToUser("owner", "wallet-address")).toBe(true);
      expect(getRlsContext().mode).toBe("service");
    });
  });

  it("fails closed when there is no verified record", async () => {
    select.mockResolvedValueOnce([]);
    expect(await isWalletBoundToUser("another-user", "wallet-address")).toBe(false);
  });
});
