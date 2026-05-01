import { describe, expect, it } from "vitest";
import { applyBotFlags, type ContributorAggregate } from "./indexer";

describe("applyBotFlags", () => {
  const mockAggs: ContributorAggregate[] = [
    {
      ghUserId: "1",
      ghUsername: "alice",
      avatarUrl: null,
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "2",
      ghUsername: "dependabot[bot]",
      avatarUrl: null,
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "3",
      ghUsername: "some-ci",
      avatarUrl: null,
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
  ];

  it("identifies bots correctly with default lists", () => {
    const result = applyBotFlags(mockAggs, [], []);
    expect(result[0]?.isBot).toBe(false); // alice
    expect(result[1]?.isBot).toBe(true);  // dependabot[bot]
    expect(result[2]?.isBot).toBe(true);  // some-ci
  });

  it("respects the allowlist (even if it looks like a bot)", () => {
    const result = applyBotFlags(mockAggs, ["dependabot[bot]"], []);
    expect(result[1]?.isBot).toBe(false);
  });

  it("respects the blocklist (even if it looks like a human)", () => {
    const result = applyBotFlags(mockAggs, [], ["alice"]);
    expect(result[0]?.isBot).toBe(true);
  });

  it("handles case-insensitivity in allow/block lists", () => {
    const resultAllow = applyBotFlags(mockAggs, ["DEPENDABOT[BOT]"], []);
    expect(resultAllow[1]?.isBot).toBe(false);

    const resultBlock = applyBotFlags(mockAggs, [], ["ALICE"]);
    expect(resultBlock[0]?.isBot).toBe(true);
  });

  it("handles empty contributor list", () => {
    const result = applyBotFlags([], [], []);
    expect(result).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const original = [...mockAggs];
    applyBotFlags(mockAggs, [], ["alice"]);
    expect(mockAggs).toEqual(original);
  });
});
