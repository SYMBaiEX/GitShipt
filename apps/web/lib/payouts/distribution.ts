import type { LeaderboardEntry } from "@/db/schema/snapshots";
import type { ContributorScoreInputs } from "@/db/schema/contributors";

/**
 * Snapshot-time projection of a contributor row, used to construct
 * deterministic LeaderboardEntry rows for snapshot freezing.
 */
export interface SnapshotContributor {
  id: string;
  ghUserId: string;
  ghUsername: string;
  rank: number;
  score: number;
  payoutRoute?: "contributor" | "treasury";
  payoutRouteReason?: string;
  inputs: ContributorScoreInputs;
}

/**
 * Build the full leaderboard array that gets frozen into snapshots.leaderboard.
 *
 * - Trusts the order of `contributors` (caller sorts by rank ASC, LIMIT topN).
 * - Annotates each row with `weight = tierWeights[rank-1]`. If the rank
 *   exceeds the tierWeights array length, the weight is 0 (entry is kept
 *   for transparency but receives nothing in distribution).
 *
 * Bags-native architecture note: the `weight` here is the snapshot-time
 * tier weight used for analytics + display + as one of several inputs to
 * the cadence-driven BPS rebalance. The on-chain BPS allocation is
 * computed separately by `lib/payouts/bps-plan.ts::allocateBpsByScore`
 * directly from contributor scores; tier weights are not the source of
 * truth for on-chain weighting.
 */
export function buildLeaderboardEntries(
  contributors: SnapshotContributor[],
  tierWeights: number[],
): LeaderboardEntry[] {
  return contributors.map((c) => {
    const idx = c.rank - 1;
    const weight =
      idx >= 0 && idx < tierWeights.length ? (tierWeights[idx] ?? 0) : 0;
    return {
      contributorId: c.id,
      ghUsername: c.ghUsername,
      ghUserId: c.ghUserId,
      rank: c.rank,
      score: c.score,
      weight,
      payoutRoute: c.payoutRoute,
      payoutRouteReason: c.payoutRouteReason,
      inputs: {
        mergedPRs: c.inputs.mergedPRs,
        commits: c.inputs.commits,
        reviews: c.inputs.reviews,
        issues: c.inputs.issues,
        netLines: c.inputs.netLines,
      },
    };
  });
}
