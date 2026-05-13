/**
 * Explicit denylist of vendor-controlled AI GitHub accounts.
 *
 * The intent is narrow: when a *vendor's* GitHub App or service account
 * commits to a repo (claude-code[bot], coderabbit[bot], devin-ai-…),
 * there is no human owner whose wallet we can route the share to. So
 * these specific logins are hard-denied — they cannot be allowlisted
 * back in.
 *
 * Open-source / user-run agents (OpenClaw, Hermes, aider, etc.) commit
 * THROUGH a user's own GitHub account. Those logins are NOT here —
 * the user who runs the agent receives the payout and decides how to
 * fund their agent from it.
 *
 * Generic CI bots (dependabot, renovate, github-actions) are still
 * detected by the broader `BOT_REGEX` in `apps/web/lib/scoring/v0.ts`,
 * but ARE allowlist-rescuable — a project owner can opt to credit them
 * if they have a wallet-routing arrangement.
 *
 * Shared between the indexer's `isBot()` and the project-config
 * validator so the same list enforces exclusion in both places.
 */
export const AI_VENDOR_DENYLIST = new Set<string>([
  // Anthropic / Claude
  "claude",
  "claude-code",
  "claude-code[bot]",
  "anthropic",
  "anthropic[bot]",
  // OpenAI
  "openai",
  "openai[bot]",
  "chatgpt",
  "chatgpt[bot]",
  "codex",
  "codex[bot]",
  // GitHub Copilot
  "copilot",
  "copilot[bot]",
  "github-copilot[bot]",
  "copilot-pull-request-reviewer[bot]",
  "copilot-swe-agent[bot]",
  // CodeRabbit
  "coderabbit",
  "coderabbit[bot]",
  "coderabbitai",
  "coderabbitai[bot]",
  // Cognition / Devin
  "devin",
  "devin-ai",
  "devin[bot]",
  "devin-ai-integration[bot]",
  // Cursor
  "cursor",
  "cursor[bot]",
  // Perplexity
  "perplexity",
  // Google
  "gemini-code-assist[bot]",
  "google-gemini[bot]",
  // Codeium / Windsurf
  "codeium",
  "codeium[bot]",
  // Tabnine
  "tabnine",
  "tabnine[bot]",
  // Sourcegraph Cody
  "sourcegraph-cody[bot]",
  "cody-ai[bot]",
  // Supermaven
  "supermaven",
  "supermaven[bot]",
  // Sweep
  "sweep-ai",
  "sweep-ai[bot]",
  // Qodo
  "qodo-merge-pro[bot]",
  "qodo-merge-pro-for-open-source[bot]",
  // Google Labs Jules
  "jules[bot]",
  // Factory.ai
  "factory-ai[bot]",
  // Continue.dev (Note: aider is user-run CLI, not in denylist)
  "continue-dev[bot]",
  // Amazon (Q Developer / CodeWhisperer)
  "amazon-q-developer-for-github-issues[bot]",
  "aws-codewhisperer[bot]",
  // Codium AI — distinct from Codeium; rebranded as Qodo for some surfaces
  "codium-ai",
  "codium-ai[bot]",
  // Bito AI
  "bito-bot[bot]",
  // PixieBrix AI
  "pixiebrix[bot]",
  // Tabby ML — open-source project but Tabby hosts a vendor bot
  "tabby-ml[bot]",
]);

/**
 * Returns true when a login is a known vendor-controlled AI service
 * account. Hard-denied — project allowlists cannot rescue these.
 *
 * Matching is exact (case-insensitive) — no regex, no substring. A
 * human whose handle is `claude-fan` is not affected; only `claude`
 * itself.
 */
export function isAiVendorAccount(login: string): boolean {
  return AI_VENDOR_DENYLIST.has(login.toLowerCase());
}
