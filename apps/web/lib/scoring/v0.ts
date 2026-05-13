/**
 * GitShipt scoring formula v0 — pure functions, no I/O.
 *
 * Score = w_pr * mergedPRs
 *       + w_commit * commits
 *       + w_review * reviews
 *       + w_issue * issues
 *       + w_lines * log10(1 + max(0, netLines))
 *
 * Default weights match the PRD; per-project `scoringConfig.weights`
 * may override any of them. Time decay is applied per-event upstream;
 * `applyTimeDecay` here is the pure helper used by aggregator code.
 */

// The hard-deny list of vendor-controlled AI accounts lives in
// @repo/shared so the project-config validator and the indexer share
// one source of truth. Only these specific GitHub logins are
// allowlist-unrescuable.
import { isAiVendorAccount } from "@repo/shared";

/**
 * Broader bot pattern — generic CI / `[bot]` suffix / `*-ci` matches.
 * Unlike `isAiVendorAccount()`, results from this regex ARE rescuable
 * via the per-project allowlist. Used only inside `isBot()` for
 * unnamed automation (dependabot, renovate, github-actions, *-ci, …).
 */
export const BOT_REGEX = /(^|[-_./\[])(bot|.*-ci)(\]|[-_./]|$)/i;

export type ScoreInputs = {
  mergedPRs: number;
  commits: number;
  reviews: number;
  issues: number;
  netLines: number;
};

export type ScoreWeights = {
  mergedPRs: number;
  commits: number;
  reviews: number;
  issues: number;
  netLines: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  mergedPRs: 3.0,
  commits: 1.0,
  reviews: 1.5,
  issues: 0.5,
  netLines: 0.2,
};

/**
 * Returns true when a login is a bot or automation account.
 *
 * Order of checks:
 *   1. Named vendor AI account (claude, codex, devin, …) — hard-deny,
 *      cannot be allowlist-rescued.
 *   2. Per-project allowlist — rescues anything not in (1).
 *   3. Per-project blocklist — bot.
 *   4. GitHub API `user.type === "Bot"` — bot (App-installed
 *      automation account; allowlist-rescuable if listed first).
 *   5. Generic `bot` / `*-ci` regex — bot (allowlist-rescuable).
 *
 * A human handle like `bot-fanatic` is allowlist-rescuable.
 * Open-source AI agents (OpenClaw, Hermes, aider) commit through their
 * user's own GitHub account, which is treated as a normal human.
 */
export function isBot(
  login: string,
  allowlist: string[],
  blocklist: string[],
  githubType?: string | null,
): boolean {
  const lower = login.toLowerCase();
  // 1. Hard-deny: named vendor AI account.
  if (isAiVendorAccount(lower)) return true;
  // 2. Allowlist wins for everything else.
  if (allowlist.some((x) => x.toLowerCase() === lower)) return false;
  // 3. Operator-specified blocklist.
  if (blocklist.some((x) => x.toLowerCase() === lower)) return true;
  // 4. GitHub App-installed automation account.
  if (githubType === "Bot") return true;
  // 5. Generic CI / bot pattern.
  return BOT_REGEX.test(lower);
}

export { isAiVendorAccount };

/**
 * Pure scoring function. Treats negative inputs as zero defensively.
 */
export function computeRawScore(
  inputs: ScoreInputs,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  const merged = Math.max(0, inputs.mergedPRs);
  const commits = Math.max(0, inputs.commits);
  const reviews = Math.max(0, inputs.reviews);
  const issues = Math.max(0, inputs.issues);
  const lines = Math.max(0, inputs.netLines);

  return (
    weights.mergedPRs * merged +
    weights.commits * commits +
    weights.reviews * reviews +
    weights.issues * issues +
    weights.netLines * Math.log10(1 + lines)
  );
}

/**
 * Linear time decay: weight scaled by `(W - daysAgo) / W`, clipped to [0, weight].
 * Returns 0 if `windowDays <= 0`.
 */
export function applyTimeDecay(
  weight: number,
  daysAgo: number,
  windowDays: number,
): number {
  if (windowDays <= 0) return 0;
  const factor = Math.max(0, (windowDays - daysAgo) / windowDays);
  return weight * factor;
}
