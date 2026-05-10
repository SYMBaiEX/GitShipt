import { describe, expect, it } from "vitest";
import { CreateProjectBodySchema, TokenMetadataSchema } from "@repo/shared";

const validBody = {
  ghOwner: "sym",
  ghRepo: "gitshipt",
  ghRepoId: "42",
  name: "GitShipt",
  symbol: "GSHIPT",
  description: "Token for sym/gitshipt. Fees redistribute to contributors.",
  imageUrl: "https://gitshipt.com/og.png",
  scoringConfig: {
    formulaVersion: "v0",
    windowDays: 30,
    weights: {
      mergedPRs: 3,
      commits: 1,
      reviews: 0,
      issues: 0,
      netLines: 0,
    },
    decay: "linear",
    botBlocklist: [],
    botAllowlist: [],
  },
  payoutConfig: {
    topN: 3,
    tierWeights: [0.5, 0.3, 0.2],
    claimThresholdLamports: 0,
  },
  platformFeeBps: 0,
} as const;

describe("Bags launch schemas", () => {
  it("requires Bags-compatible token descriptions", () => {
    expect(
      TokenMetadataSchema.safeParse({
        name: "GitShipt",
        symbol: "GSHIPT",
        description: "",
        imageUrl: "https://gitshipt.com/og.png",
      }).success,
    ).toBe(false);

    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        description: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("requires social links to be full URLs when present", () => {
    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        twitter: "@symbiex",
      }).success,
    ).toBe(false);

    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        twitter: "https://x.com/symbiex",
        telegram: "https://t.me/gitshipt",
      }).success,
    ).toBe(true);
  });

  it("allows zero legacy platform fee because revenue uses the Bags partner rail", () => {
    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        platformFeeBps: -1,
      }).success,
    ).toBe(false);

    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        platformFeeBps: 0,
      }).success,
    ).toBe(true);

    expect(
      CreateProjectBodySchema.safeParse({
        ...validBody,
        platformFeeBps: 2500,
      }).success,
    ).toBe(true);
  });
});
