/**
 * Pure BPS-allocation logic for the Bags-native cadence rebalance.
 *
 * Given (a) the project's current claimer slots in fixed slot-index order
 * and (b) the latest snapshot's leaderboard with per-contributor scores,
 * compute the BPS array to write on-chain — proportional to score, with
 * absent contributors zeroed, and rounding ensuring the total is exactly
 * 10000.
 *
 * Pure function, no I/O — easy to unit test and reason about. The
 * workflow step helper that wraps this concern is responsible for
 * loading the inputs and persisting the result.
 */

export interface ClaimerSlotInput {
  slotIndex: number;
  /** github_login (lowercased) if the slot was resolved via the github
   *  provider; null otherwise (raw wallet claimer or non-github social). */
  githubLogin: string | null;
  /** Optional FK to our internal contributor record. */
  contributorId: string | null;
  /** Current BPS — used as the fallback if the new plan would be all-zero. */
  currentBps: number;
}

export interface LeaderboardScoreInput {
  contributorId: string;
  ghUsername: string;
  /** Non-negative weight derived from this period's activity. */
  score: number;
}

export interface BpsAllocationResult {
  /** New BPS aligned to slot indices [0..N-1]. Sum is exactly 10000. */
  bps: number[];
  /** True when the inputs produced no signal (all scores zero or no
   *  matching slots) and the previous BPS was preserved instead. */
  preservedPrevious: boolean;
  /**
   * Number of slots whose pubkey appeared in the leaderboard with a
   * positive score. If 0, we have nothing to allocate by merit and the
   * function returns the previous BPS unchanged (preservedPrevious=true).
   */
  matchedSlots: number;
}

/**
 * Compute new BPS for each slot, proportional to the matching
 * contributor's score in the latest snapshot. Slots with no matching
 * scoring contributor (including absent and non-github slots) get 0.
 *
 * Distribution algorithm:
 *   1. Build matched-score array per slot (0 if no match).
 *   2. If all matched scores are zero → no signal → return previous BPS
 *      unchanged (preservedPrevious=true). Allows the cron to advance
 *      `nextRunAt` without writing a no-op tx.
 *   3. Else: floor-divide proportionally to total score, distribute
 *      remainder to the highest-fractional-residue slots so the sum is
 *      exactly 10000.
 *
 * Determinism: ties in remainder distribution are broken by slot index
 * (lower index wins) so the same input always produces the same output.
 */
export function allocateBpsByScore(
  slots: ReadonlyArray<ClaimerSlotInput>,
  leaderboard: ReadonlyArray<LeaderboardScoreInput>,
): BpsAllocationResult {
  const n = slots.length;
  if (n === 0) {
    return { bps: [], preservedPrevious: false, matchedSlots: 0 };
  }

  // Index leaderboard by contributorId AND ghUsername (lowercased) for
  // robust matching against either resolution path.
  const byContributorId = new Map<string, number>();
  const byUsername = new Map<string, number>();
  for (const entry of leaderboard) {
    if (entry.score <= 0) continue;
    byContributorId.set(entry.contributorId, entry.score);
    byUsername.set(entry.ghUsername.toLowerCase(), entry.score);
  }

  const scores = new Array<number>(n);
  let totalScore = 0;
  let matchedSlots = 0;
  for (let i = 0; i < n; i++) {
    const slot = slots[i]!;
    let s = 0;
    if (slot.contributorId) {
      s = byContributorId.get(slot.contributorId) ?? 0;
    }
    if (s === 0 && slot.githubLogin) {
      s = byUsername.get(slot.githubLogin) ?? 0;
    }
    scores[i] = s;
    if (s > 0) matchedSlots++;
    totalScore += s;
  }

  if (totalScore === 0) {
    return {
      bps: slots.map((s) => s.currentBps),
      preservedPrevious: true,
      matchedSlots,
    };
  }

  // Proportional allocation with largest-remainder rounding.
  const exact = scores.map((s) => (s / totalScore) * 10_000);
  const floors = exact.map((v) => Math.floor(v));
  const remainders = exact.map((v, i) => ({
    index: i,
    frac: v - Math.floor(v),
  }));
  const allocated = floors.reduce((a, b) => a + b, 0);
  const remainder = 10_000 - allocated;

  // Distribute the remainder by largest fractional residue, ties broken
  // by lower slot index (deterministic).
  remainders.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.index - b.index;
  });
  const bps = floors.slice();
  for (let i = 0; i < remainder && i < remainders.length; i++) {
    bps[remainders[i]!.index]! += 1;
  }
  // Sanity: only meaningful if there were positive scores.
  const sum = bps.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) {
    throw new Error(`internal: bps sum ${sum} != 10000 (programming error)`);
  }

  return { bps, preservedPrevious: false, matchedSlots };
}

import { createHash } from "node:crypto";

/**
 * Deterministic hash of a (config, plan) pair used as the
 * bags_rebalance_attempts.plan_hash idempotency key.
 *
 * Inputs are concatenated in canonical order so the same logical plan
 * always hashes the same regardless of array iteration order in the
 * caller's source.
 */
export function hashRebalancePlan(args: {
  feeShareConfigId: string;
  bps: ReadonlyArray<number>;
  fromIdx: number;
  toIdx: number;
  finalizeUpdate: boolean;
}): string {
  const h = createHash("sha256");
  h.update(args.feeShareConfigId);
  h.update("|");
  h.update(`${args.fromIdx},${args.toIdx},${args.finalizeUpdate ? 1 : 0}`);
  h.update("|");
  h.update(args.bps.join(","));
  return h.digest("hex");
}
