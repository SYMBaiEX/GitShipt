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
    expect(result[1]?.isBot).toBe(true); // dependabot[bot] (ghType=Bot + regex)
    expect(result[2]?.isBot).toBe(true); // some-ci (generic CI pattern)
    expect(result[3]?.isBot).toBe(true); // bot-fanatic (generic bot pattern)
    expect(result[4]?.isBot).toBe(true); // claude-code[bot] (AI vendor hard-deny)
  });

  it("allowlist rescues generic 'bot' false positives", () => {
    const result = applyBotFlags(mockAggs, ["bot-fanatic"], []);
    expect(result[3]?.isBot).toBe(false);
  });

  it("allowlist rescues dependabot when the project routes it", () => {
    const result = applyBotFlags(mockAggs, ["dependabot[bot]"], []);
    expect(result[1]?.isBot).toBe(false);
  });

  it("allowlist CANNOT override the AI-vendor hard-deny", () => {
    const result = applyBotFlags(mockAggs, ["claude-code[bot]", "codex"], []);
    expect(result[4]?.isBot).toBe(true); // claude-code[bot] still excluded
  });

  it("treats unknown ghType=Bot accounts as bots (allowlist-rescuable)", () => {
    const unknownBot: ContributorAggregate = {
      ghUserId: "99",
      ghUsername: "some-future-ci",
      avatarUrl: null,
      ghType: "Bot",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    };
    expect(applyBotFlags([unknownBot], [], [])[0]?.isBot).toBe(true);
    // Project owner can rescue if they have a wallet-routing arrangement.
    expect(applyBotFlags([unknownBot], ["some-future-ci"], [])[0]?.isBot).toBe(
      false,
    );
  });

  it("does NOT exclude open-source agent operators (OpenClaw, Hermes)", () => {
    // Open-source / user-run agents commit through the user's own
    // GitHub account. Those accounts are human and should be paid.
    const openclawDev: ContributorAggregate = {
      ghUserId: "10",
      ghUsername: "openclaw-developer",
      avatarUrl: null,
      ghType: "User",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    };
    const hermesMaintainer: ContributorAggregate = {
      ghUserId: "11",
      ghUsername: "hermes-maintainer",
      avatarUrl: null,
      ghType: "User",
      inputs: { mergedPRs: 1, commits: 1, reviews: 1, issues: 1, netLines: 1 },
      isBot: false,
    };
    const result = applyBotFlags([openclawDev, hermesMaintainer], [], []);
    expect(result[0]?.isBot).toBe(false);
    expect(result[1]?.isBot).toBe(false);
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
