import { describe, expect, it } from "vitest";
import { applyBotFlags, type ContributorAggregate } from "./indexer";

describe("applyBotFlags", () => {
  const mockAggs: ContributorAggregate[] = [
    {
      ghUserId: "1",
      ghUsername: "alice",
      avatarUrl: null,
      ghType: "User",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "2",
      ghUsername: "dependabot[bot]",
      avatarUrl: null,
      ghType: "Bot",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "3",
      ghUsername: "some-ci",
      avatarUrl: null,
      ghType: "User",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "4",
      ghUsername: "bot-fanatic",
      avatarUrl: null,
      ghType: "User",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
    {
      ghUserId: "5",
      ghUsername: "claude-code[bot]",
      avatarUrl: null,
      ghType: "Bot",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    },
  ];

  it("identifies bots correctly with default lists", () => {
    const result = applyBotFlags(mockAggs, [], []);
    expect(result[0]?.isBot).toBe(false); // alice (User)
    expect(result[1]?.isBot).toBe(true); // dependabot[bot] (AI hard-deny)
    expect(result[2]?.isBot).toBe(true); // some-ci (generic CI pattern)
    expect(result[3]?.isBot).toBe(true); // bot-fanatic (generic bot pattern)
    expect(result[4]?.isBot).toBe(true); // claude-code[bot] (AI hard-deny)
  });

  it("allowlist can rescue generic 'bot' false positives", () => {
    const result = applyBotFlags(mockAggs, ["bot-fanatic"], []);
    expect(result[3]?.isBot).toBe(false);
  });

  it("allowlist cannot override the AI hard-deny list", () => {
    const result = applyBotFlags(mockAggs, ["dependabot[bot]", "claude-code[bot]"], []);
    expect(result[1]?.isBot).toBe(true); // dependabot still excluded
    expect(result[4]?.isBot).toBe(true); // claude still excluded
  });

  it("GitHub type=Bot hard-denies even unknown logins", () => {
    const unknownBot: ContributorAggregate = {
      ghUserId: "99",
      ghUsername: "some-future-ai",
      avatarUrl: null,
      ghType: "Bot",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    };
    const result = applyBotFlags([unknownBot], ["some-future-ai"], []);
    expect(result[0]?.isBot).toBe(true);
  });

  it("respects the blocklist (even if it looks like a human)", () => {
    const result = applyBotFlags(mockAggs, [], ["alice"]);
    expect(result[0]?.isBot).toBe(true);
  });

  it("handles case-insensitivity in allow/block lists", () => {
    const resultAllow = applyBotFlags(mockAggs, ["BOT-FANATIC"], []);
    expect(resultAllow[3]?.isBot).toBe(false);

    const resultBlock = applyBotFlags(mockAggs, [], ["ALICE"]);
    expect(resultBlock[0]?.isBot).toBe(true);
  });

  it("handles empty contributor list", () => {
    const result = applyBotFlags([], [], []);
    expect(result).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const original = JSON.parse(JSON.stringify(mockAggs));
    applyBotFlags(mockAggs, [], ["alice"]);
    expect(mockAggs).toEqual(original);
  });
});
