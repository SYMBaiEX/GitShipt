/**
 * Hard-coded AI / automation login list. Shared between the scoring layer
 * (`apps/web/lib/scoring/v0.ts`) and the project-config validator
 * (`launch-schemas.ts`) so the same patterns enforce exclusion at index
 * time and at config time.
 *
 * Adding a new AI agent here retroactively re-classifies existing
 * contributor rows on the next index pass (see contributors-upsert).
 */

/**
 * AI agents matched here are hard-denied — they cannot be allowlisted.
 * This is *only* named AI / automation products, not the generic
 * `bot`/`-ci` pattern. Humans whose handles happen to contain "bot" can
 * still be allowlist-rescued by `isBot()` in `apps/web/lib/scoring/v0.ts`,
 * which layers a broader regex on top of this one.
 */
export const AI_BOT_REGEX =
  /(^|[-_./\[])(claude|claude-code|anthropic|cursor|codex|chatgpt|openai|perplexity|gemini-code-assist|gemini-code|google-gemini|copilot|github-copilot|copilot-pull-request-reviewer|copilot-swe-agent|coderabbit|coderabbitai|devin|devin-ai|devin-ai-integration|sweep-ai|qodo-merge-pro|qodo-merge|qodo|codeium|tabnine|sourcegraph-cody|cody-ai|supermaven|jules|factory-ai|continue-dev|aider|github-actions|dependabot|renovate)(\]|[-_./]|$)/i;

export const AI_BOT_EXACT = new Set<string>([
  "claude",
  "claude-code",
  "claude-code[bot]",
  "anthropic",
  "anthropic[bot]",
  "cursor",
  "cursor[bot]",
  "codex",
  "codex[bot]",
  "chatgpt",
  "chatgpt[bot]",
  "openai",
  "openai[bot]",
  "perplexity",
  "copilot",
  "copilot[bot]",
  "github-copilot[bot]",
  "copilot-pull-request-reviewer[bot]",
  "copilot-swe-agent[bot]",
  "coderabbit",
  "coderabbit[bot]",
  "coderabbitai",
  "coderabbitai[bot]",
  "devin",
  "devin-ai",
  "devin[bot]",
  "devin-ai-integration[bot]",
  "sweep-ai",
  "sweep-ai[bot]",
  "qodo-merge-pro[bot]",
  "qodo-merge-pro-for-open-source[bot]",
  "codeium",
  "codeium[bot]",
  "tabnine",
  "tabnine[bot]",
  "sourcegraph-cody[bot]",
  "cody-ai[bot]",
  "supermaven",
  "supermaven[bot]",
  "gemini-code-assist[bot]",
  "google-gemini[bot]",
  "jules[bot]",
  "factory-ai[bot]",
  "continue-dev[bot]",
  "aider[bot]",
  "github-actions[bot]",
  "dependabot[bot]",
  "renovate[bot]",
]);

/**
 * Returns true when a login matches the hard-coded AI / automation list.
 * Project allowlists cannot un-classify these — no AI ever gets paid.
 */
export function isAiBot(login: string): boolean {
  const lower = login.toLowerCase();
  if (AI_BOT_EXACT.has(lower)) return true;
  return AI_BOT_REGEX.test(lower);
}
