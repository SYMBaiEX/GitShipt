import type { LeaderboardEntry } from "@/db/schema/snapshots";
import { describe, expect, it } from "vitest";
import { buildBagsFeeShareDistributionPlan } from "./fee-share-distribution";

function entry(
  contributorId: string,
  rank: number,
  payoutRoute?: LeaderboardEntry["payoutRoute"],
): LeaderboardEntry {
  return {
    contributorId,
    ghUsername: contributorId,
    ghUserId: `gh-${contributorId}`,
    rank,
    score: 100 - rank,
    weight: rank === 1 ? 0.5 : rank === 2 ? 0.3 : 0.2,
    payoutRoute,
    inputs: {
      mergedPRs: 0,
      commits: 0,
      reviews: 0,
      issues: 0,
      netLines: 0,
    },
  };
}

const payoutConfig = {
  topN: 3,
  tierWeights: [0.5, 0.3, 0.2],
  claimThresholdLamports: 0,
};

describe("buildBagsFeeShareDistributionPlan", () => {
  it("routes linked contributors directly and unlinked contributors to the pool", () => {
    const plan = buildBagsFeeShareDistributionPlan({
      leaderboard: [entry("alice", 1), entry("bob", 2), entry("carol", 3)],
      payoutConfig,
      walletAddresses: {
        alice: "alice-wallet",
        bob: "bob-wallet",
      },
      platformFeeBps: 0,
      contributorPoolWallet: "pool-wallet",
      treasuryWallet: "treasury-wallet",
    });

    expect(plan).toMatchObject({
      directContributorBps: 8000,
      contributorPoolBps: 2000,
      treasuryBps: 0,
      pooledUnlinkedBps: 2000,
      pooledOverflowBps: 0,
      pooledRoundingBps: 0,
    });
    expect(plan.feeClaimers).toEqual([
      { wallet: "alice-wallet", bps: 5000, role: "contributor" },
      { wallet: "bob-wallet", bps: 3000, role: "contributor" },
      { wallet: "pool-wallet", bps: 2000, role: "contributor_pool" },
    ]);
  });

  it("keeps all contributor fees in the pool when nobody has linked a wallet", () => {
    const plan = buildBagsFeeShareDistributionPlan({
      leaderboard: [entry("alice", 1), entry("bob", 2), entry("carol", 3)],
      payoutConfig,
      walletAddresses: {},
      platformFeeBps: 0,
      contributorPoolWallet: "pool-wallet",
      treasuryWallet: "treasury-wallet",
    });

    expect(plan.feeClaimers).toEqual([
      { wallet: "pool-wallet", bps: 10000, role: "contributor_pool" },
    ]);
    expect(plan.contributorPoolBps).toBe(10000);
  });

  it("routes automated contributor share to treasury", () => {
    const plan = buildBagsFeeShareDistributionPlan({
      leaderboard: [
        entry("alice", 1),
        entry("github-actions[bot]", 2, "treasury"),
      ],
      payoutConfig,
      walletAddresses: {
        alice: "alice-wallet",
        "github-actions[bot]": "bot-wallet",
      },
      platformFeeBps: 0,
      contributorPoolWallet: "pool-wallet",
      treasuryWallet: "treasury-wallet",
    });

    expect(plan.feeClaimers).toEqual([
      { wallet: "alice-wallet", bps: 6250, role: "contributor" },
      { wallet: "treasury-wallet", bps: 3750, role: "treasury" },
    ]);
    expect(plan.treasuryBps).toBe(3750);
    expect(plan.pooledRoundingBps).toBe(0);
  });

  it("falls back to the pool when Bags max-claimer slots are exhausted", () => {
    const plan = buildBagsFeeShareDistributionPlan({
      leaderboard: [entry("alice", 1), entry("bob", 2), entry("carol", 3)],
      payoutConfig,
      walletAddresses: {
        alice: "alice-wallet",
        bob: "bob-wallet",
        carol: "carol-wallet",
      },
      platformFeeBps: 0,
      contributorPoolWallet: "pool-wallet",
      treasuryWallet: "treasury-wallet",
      maxClaimers: 3,
    });

    expect(plan.feeClaimers).toEqual([
      { wallet: "alice-wallet", bps: 5000, role: "contributor" },
      { wallet: "bob-wallet", bps: 3000, role: "contributor" },
      { wallet: "pool-wallet", bps: 2000, role: "contributor_pool" },
    ]);
    expect(plan.pooledOverflowBps).toBe(2000);
  });
});
