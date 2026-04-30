import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEXSCREENER_STUB_TX_SENTINEL } from "@repo/shared";

const VALID_PUBKEY = "4Nd1mZ8eR8m8eR8m8eR8m8eR8m8eR8m8eR8m8eR8m8mZ";

describe("bags client — dexscreener wrappers in stub mode", () => {
  const original = process.env.BAGS_API_KEY;

  beforeEach(() => {
    delete process.env.BAGS_API_KEY;
    vi.resetModules();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.BAGS_API_KEY;
    else process.env.BAGS_API_KEY = original;
    vi.resetModules();
  });

  it("checkOrderAvailability returns { available: true } without creds", async () => {
    const { bags } = await import("./client");
    const result = await bags.checkDexscreenerOrderAvailability(VALID_PUBKEY);
    expect(result).toEqual({ available: true });
  });

  it("createOrder returns the sentinel transaction string in stub mode", async () => {
    const { bags } = await import("./client");
    const order = await bags.createDexscreenerOrder({
      tokenAddress: VALID_PUBKEY,
      description: "stub-test",
      iconImageUrl: "https://example.com/i.png",
      headerImageUrl: "https://example.com/h.png",
      payerWallet: VALID_PUBKEY,
    });
    expect(order.transaction).toBe(DEXSCREENER_STUB_TX_SENTINEL);
    expect(order.priceUSDC).toBe(299);
    expect(order.orderUUID.startsWith("stub-ds-")).toBe(true);
  });

  it("submitPayment returns a deterministic stub signature", async () => {
    const { bags } = await import("./client");
    const sig = await bags.submitDexscreenerPayment({
      orderUUID: "stub-ds-abc",
      paymentSignature: "irrelevant",
    });
    expect(sig).toBe("stub-ds-payment-stub-ds-abc");
  });
});
