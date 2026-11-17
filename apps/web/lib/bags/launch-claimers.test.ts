import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildDirectLaunchClaimers } from "./launch-claimers";

const candidates = [
  { id: "a", ghUsername: "SYMBaiEX", score: 3 },
  { id: "b", ghUsername: "dexploarer", score: 1 },
  { id: "c", ghUsername: "unlinked", score: 2 },
];
describe("direct launch claimers", () => {
  it("allocates all contributor BPS directly to linked identities", () => {
    const plan = buildDirectLaunchClaimers(candidates, [
      { username: "symbaiex", wallet: "wallet-a" },
      { username: "dexploarer", wallet: "wallet-b" },
      { username: "unlinked", wallet: null },
    ]);
    expect(plan.map((c) => [c.contributorId, c.initialBps])).toEqual([
      ["a", 7500],
      ["b", 2500],
    ]);
    expect(plan.every((c) => c.provider === "github")).toBe(true);
  });
  it("requires a Bags-linked recipient", () => {
    expect(() => buildDirectLaunchClaimers(candidates, [])).toThrow(
      /No scored contributors/,
    );
  });
  it("reserves the platform share and apportions the remainder", () => {
    const plan = buildDirectLaunchClaimers(candidates, [
      { username: "symbaiex", wallet: "wallet-a" },
      { username: "dexploarer", wallet: "wallet-b" },
    ], { wallet: "treasury", bps: 1000 });
    expect(plan.map((c) => [c.claimerPubkey, c.initialBps])).toEqual([
      ["wallet-a", 6750], ["wallet-b", 2250], ["treasury", 1000],
    ]);
    expect(plan[2]).toMatchObject({ provider: "wallet", socialHandle: "gitshipt:platform" });
  });
  it("rejects a treasury wallet shared by a contributor", () => {
    expect(() => buildDirectLaunchClaimers(candidates, [
      { username: "symbaiex", wallet: "wallet-a" },
    ], { wallet: "wallet-a", bps: 1000 })).toThrow(/distinct/);
  });
  it("skips rounded-to-zero allocations and keeps slot indices dense", () => {
    const plan = buildDirectLaunchClaimers(
      [
        { id: "tiny", ghUsername: "tiny", score: 0.000001 },
        { id: "large", ghUsername: "large", score: 10000 },
      ],
      [
        { username: "tiny", wallet: "tiny-wallet" },
        { username: "large", wallet: "large-wallet" },
      ],
    );
    expect(plan).toMatchObject([
      { slotIndex: 0, contributorId: "large", initialBps: 10000 },
    ]);
  });
  it("rejects overlapping contributor wallets", () => {
    expect(() =>
      buildDirectLaunchClaimers(candidates, [
        { username: "SYMBaiEX", wallet: "shared" },
        { username: "dexploarer", wallet: "shared" },
      ]),
    ).toThrow(/same Bags wallet/);
  });
  it("ignores non-finite scores and preserves exact BPS totals", () => {
    const plan = buildDirectLaunchClaimers(
      [...candidates, { id: "bad", ghUsername: "bad", score: Infinity }],
      candidates.map((c) => ({ username: c.ghUsername, wallet: c.id })),
    );
    expect(plan.reduce((n, c) => n + c.initialBps, 0)).toBe(10000);
    expect(plan).toHaveLength(3);
  });
});
