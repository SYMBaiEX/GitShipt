import { describe, expect, it } from "vitest";
import {
  allocateBpsByScore,
  hashRebalancePlan,
  type ClaimerSlotInput,
  type LeaderboardScoreInput,
} from "./bps-plan";

function slot(
  i: number,
  attrs: Partial<ClaimerSlotInput> = {},
): ClaimerSlotInput {
  return {
    slotIndex: i,
    githubLogin: `user${i}`,
    contributorId: `contrib_${i}`,
    currentBps: 0,
    ...attrs,
  };
}

function lb(
  contributorId: string,
  ghUsername: string,
  score: number,
): LeaderboardScoreInput {
  return { contributorId, ghUsername, score };
}

describe("allocateBpsByScore", () => {
  it("returns empty result for zero slots", () => {
    const r = allocateBpsByScore([], []);
    expect(r.bps).toEqual([]);
    expect(r.preservedPrevious).toBe(false);
    expect(r.matchedSlots).toBe(0);
  });

  it("returns previous BPS unchanged when all scores are zero", () => {
    const slots = [
      slot(0, { currentBps: 7000 }),
      slot(1, { currentBps: 3000 }),
    ];
    const r = allocateBpsByScore(slots, []);
    expect(r.bps).toEqual([7000, 3000]);
    expect(r.preservedPrevious).toBe(true);
    expect(r.matchedSlots).toBe(0);
  });

  it("allocates proportionally when scores are evenly divisible", () => {
    const slots = [slot(0), slot(1), slot(2), slot(3)];
    const board = [
      lb("contrib_0", "user0", 25),
      lb("contrib_1", "user1", 25),
      lb("contrib_2", "user2", 25),
      lb("contrib_3", "user3", 25),
    ];
    const r = allocateBpsByScore(slots, board);
    expect(r.bps).toEqual([2500, 2500, 2500, 2500]);
    expect(r.preservedPrevious).toBe(false);
    expect(r.matchedSlots).toBe(4);
  });

  it("uses largest-remainder rounding to make sum exactly 10000", () => {
    const slots = [slot(0), slot(1), slot(2)];
    // Three contributors scoring 1, 1, 1 → exact split is 3333.33...
    // Largest remainder gives [3334, 3333, 3333] (slot 0 gets the +1
    // because ties break to lower index).
    const board = [
      lb("contrib_0", "user0", 1),
      lb("contrib_1", "user1", 1),
      lb("contrib_2", "user2", 1),
    ];
    const r = allocateBpsByScore(slots, board);
    expect(r.bps.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(r.bps).toEqual([3334, 3333, 3333]);
  });

  it("zeroes BPS for slots with no matching contributor", () => {
    const slots = [slot(0), slot(1), slot(2)];
    // Only slot 1's contributor scored anything.
    const board = [lb("contrib_1", "user1", 100)];
    const r = allocateBpsByScore(slots, board);
    expect(r.bps).toEqual([0, 10000, 0]);
    expect(r.matchedSlots).toBe(1);
  });

  it("matches by contributorId first, falls back to ghUsername", () => {
    // Slot has contributorId but the leaderboard entry uses a different ID
    // — should fall back to ghUsername match.
    const slots = [
      slot(0, { contributorId: "old_id", githubLogin: "octocat" }),
    ];
    const board = [lb("new_id", "Octocat", 100)]; // different ID, same handle (case-insensitive)
    const r = allocateBpsByScore(slots, board);
    expect(r.bps).toEqual([10000]);
  });

  it("ignores non-positive scores in the leaderboard", () => {
    const slots = [slot(0), slot(1)];
    const board = [
      lb("contrib_0", "user0", 100),
      lb("contrib_1", "user1", 0),
      lb("contrib_1", "user1", -5),
    ];
    const r = allocateBpsByScore(slots, board);
    expect(r.bps).toEqual([10000, 0]);
    expect(r.matchedSlots).toBe(1);
  });

  it("breaks remainder ties by lower slot index deterministically", () => {
    const slots = [slot(0), slot(1), slot(2), slot(3), slot(4), slot(5), slot(6)];
    // 7 equal scores → 1428.57... per slot. Floors = 1428, sum = 9996,
    // remainder = 4. The 4 lowest-index slots should each get +1.
    const board = slots.map((s, i) =>
      lb(`contrib_${i}`, s.githubLogin!, 1),
    );
    const r = allocateBpsByScore(slots, board);
    expect(r.bps.reduce((a, b) => a + b, 0)).toBe(10_000);
    // Slots 0..3 get the +1 (deterministic tie-break).
    expect(r.bps).toEqual([1429, 1429, 1429, 1429, 1428, 1428, 1428]);
  });
});

describe("hashRebalancePlan", () => {
  const base = {
    feeShareConfigId: "cfg_abc",
    bps: [5000, 3000, 2000],
    fromIdx: 0,
    toIdx: 2,
    finalizeUpdate: false,
  };

  it("returns a deterministic 64-char hex string", () => {
    const h = hashRebalancePlan(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRebalancePlan(base)).toBe(h);
  });

  it("produces a different hash when bps changes", () => {
    const a = hashRebalancePlan(base);
    const b = hashRebalancePlan({ ...base, bps: [5001, 2999, 2000] });
    expect(a).not.toBe(b);
  });

  it("produces a different hash when slot range changes", () => {
    expect(hashRebalancePlan(base)).not.toBe(
      hashRebalancePlan({ ...base, fromIdx: 1, toIdx: 2, bps: [3000, 2000] }),
    );
  });

  it("produces a different hash when finalizeUpdate flips", () => {
    expect(hashRebalancePlan(base)).not.toBe(
      hashRebalancePlan({ ...base, finalizeUpdate: true }),
    );
  });

  it("is sensitive to feeShareConfigId — same plan on different configs hashes differently", () => {
    expect(hashRebalancePlan(base)).not.toBe(
      hashRebalancePlan({ ...base, feeShareConfigId: "cfg_xyz" }),
    );
  });
});
