import { describe, expect, it } from "vitest";
import {
  CreateDexscreenerOrderInputSchema,
  DexscreenerOrderInputSchema,
  DexscreenerOrderLinkSchema,
  DexscreenerOrderSchema,
  SubmitDexscreenerPaymentInputSchema,
  DEXSCREENER_PRICE_USDC,
  DEXSCREENER_STUB_TX_SENTINEL,
} from "@repo/shared";

const VALID_PUBKEY = "4Nd1mZ8eR8m8eR8m8eR8m8eR8m8eR8m8eR8m8eR8m8mZ";

describe("DexscreenerOrderLinkSchema", () => {
  it("requires a parseable url", () => {
    expect(() =>
      DexscreenerOrderLinkSchema.parse({ url: "not-a-url" }),
    ).toThrow();
    expect(
      DexscreenerOrderLinkSchema.parse({ url: "https://example.com" }).url,
    ).toBe("https://example.com");
  });
  it("rejects empty labels", () => {
    expect(() =>
      DexscreenerOrderLinkSchema.parse({
        url: "https://example.com",
        label: "",
      }),
    ).toThrow();
  });
});

describe("DexscreenerOrderInputSchema", () => {
  const base = {
    tokenAddress: VALID_PUBKEY,
    description: "Solana launch fund",
    iconImageUrl: "https://cdn.example.com/icon.png",
    headerImageUrl: "https://cdn.example.com/header.png",
    payerWallet: VALID_PUBKEY,
  };
  it("accepts a minimal valid order", () => {
    expect(() => DexscreenerOrderInputSchema.parse(base)).not.toThrow();
  });
  it("rejects an empty description", () => {
    expect(() =>
      DexscreenerOrderInputSchema.parse({ ...base, description: "" }),
    ).toThrow();
  });
  it("rejects non-http icon URLs", () => {
    expect(() =>
      DexscreenerOrderInputSchema.parse({ ...base, iconImageUrl: "//cdn/x" }),
    ).toThrow();
  });
  it("treats links as optional", () => {
    expect(() =>
      DexscreenerOrderInputSchema.parse({ ...base, links: undefined }),
    ).not.toThrow();
  });
});

describe("DexscreenerOrderSchema", () => {
  it("requires a positive price", () => {
    expect(() =>
      DexscreenerOrderSchema.parse({
        orderUUID: "x",
        recipientWallet: VALID_PUBKEY,
        priceUSDC: 0,
        transaction: "blob",
        lastValidBlockHeight: 1,
      }),
    ).toThrow();
  });
});

describe("CreateDexscreenerOrderInputSchema", () => {
  const base = {
    projectId: "proj_x",
    payerWallet: VALID_PUBKEY,
    headerImageUrl: "https://cdn.example.com/header.png",
  };
  it("accepts the minimal required shape", () => {
    expect(() =>
      CreateDexscreenerOrderInputSchema.parse(base),
    ).not.toThrow();
  });
  it("caps links at 8", () => {
    const links = Array.from({ length: 9 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    expect(() =>
      CreateDexscreenerOrderInputSchema.parse({ ...base, links }),
    ).toThrow();
  });
  it("treats descriptionOverride as optional", () => {
    expect(() =>
      CreateDexscreenerOrderInputSchema.parse({
        ...base,
        descriptionOverride: "custom",
      }),
    ).not.toThrow();
  });
});

describe("SubmitDexscreenerPaymentInputSchema", () => {
  it("rejects short signatures", () => {
    expect(() =>
      SubmitDexscreenerPaymentInputSchema.parse({
        orderUuid: "u",
        paymentSignature: "tooShort",
      }),
    ).toThrow();
  });
  it("rejects non-base58 signatures of correct length", () => {
    // 88 chars but contains '0' which is not in the base58 alphabet
    const bad = "0".repeat(88);
    expect(() =>
      SubmitDexscreenerPaymentInputSchema.parse({
        orderUuid: "u",
        paymentSignature: bad,
      }),
    ).toThrow();
  });
  it("accepts a real base58 ed25519 signature shape", () => {
    // 87 chars of valid base58 alphabet
    const goodSig =
      "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    expect(() =>
      SubmitDexscreenerPaymentInputSchema.parse({
        orderUuid: "u",
        paymentSignature: goodSig,
      }),
    ).not.toThrow();
  });
  it("accepts stub-mode payment signatures", () => {
    expect(() =>
      SubmitDexscreenerPaymentInputSchema.parse({
        orderUuid: "u",
        paymentSignature: "stub-ds-payment-stub-ds-1",
      }),
    ).not.toThrow();
  });
});

describe("constants", () => {
  it("price is 299 USDC", () => {
    expect(DEXSCREENER_PRICE_USDC).toBe(299);
  });
  it("stub sentinel is a stable string", () => {
    expect(DEXSCREENER_STUB_TX_SENTINEL).toBe("stub:dexscreener:tx");
  });
});
