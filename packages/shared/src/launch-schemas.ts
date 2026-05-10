import { z } from "zod";

/**
 * Wizard schemas shared by the client form and the server route handlers.
 * All values that touch the DB or Bags API flow through these schemas at
 * least once on the server side — never trust client-side validation alone.
 */

// ============================================================
// Step 2: Token metadata
// ============================================================

export const TokenMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(32, "Max 32 characters"),
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required")
    .max(10, "Max 10 characters")
    .regex(/^[A-Z0-9]+$/, "Uppercase letters and numbers only"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(1000, "Max 1000 characters"),
  imageUrl: z.string().url("Must be a valid URL"),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  twitter: z
    .string()
    .trim()
    .url("Must be a full URL")
    .max(200, "Max 200 characters")
    .optional()
    .or(z.literal("")),
  telegram: z
    .string()
    .trim()
    .url("Must be a full URL")
    .max(200, "Max 200 characters")
    .optional()
    .or(z.literal("")),
});
export type TokenMetadataInput = z.infer<typeof TokenMetadataSchema>;

// ============================================================
// Step 3: Leaderboard config
// ============================================================

export const ScoringConfigSchema = z.object({
  formulaVersion: z.enum(["v0", "v1"]).default("v0"),
  windowDays: z.number().int().min(7).max(90),
  weights: z.object({
    mergedPRs: z.number().min(0),
    commits: z.number().min(0),
    reviews: z.number().min(0),
    issues: z.number().min(0),
    netLines: z.number().min(0),
  }),
  decay: z.enum(["off", "linear", "exponential"]).default("linear"),
  botBlocklist: z.array(z.string()).default([]),
  botAllowlist: z.array(z.string()).default([]),
});
export type ScoringConfigInput = z.infer<typeof ScoringConfigSchema>;

/**
 * v1.1 — allowed steady-state cadence options for BPS rebalancing.
 * The 24h initial → 3d second ramp-up is hard-coded in the workflow;
 * only the post-ramp cadence is configurable per project.
 */
export const STEADY_STATE_CADENCE_OPTIONS = [72, 120, 168] as const;
export type SteadyStateCadenceHours =
  (typeof STEADY_STATE_CADENCE_OPTIONS)[number];

export const PayoutConfigSchema = z
  .object({
    topN: z.number().int().min(3).max(50),
    tierWeights: z.array(z.number().min(0).max(1)).min(3).max(50),
    claimThresholdLamports: z.number().int().min(0),
    /**
     * v1.1 cadence — hours between BPS rebalances after the initial 24h /
     * 3d ramp-up. Optional during transition; required by Phase 6 when
     * the legacy fields above are dropped.
     */
    steadyStateCadenceHours: z
      .union([z.literal(72), z.literal(120), z.literal(168)])
      .optional(),
    /**
     * v1.1 max contributor claimer slots at launch. Defaults to 50; can
     * go up to 100 (Bags fee-share-v2 program ceiling). Optional during
     * transition.
     */
    maxClaimers: z.number().int().min(1).max(100).optional(),
  })
  .refine((v) => v.tierWeights.length === v.topN, {
    message: "tierWeights length must equal topN",
    path: ["tierWeights"],
  })
  .refine(
    (v) => {
      const sum = v.tierWeights.reduce((a, b) => a + b, 0);
      return sum >= 0.999 && sum <= 1.001;
    },
    {
      message: "tierWeights must sum to 1.0 (±0.001)",
      path: ["tierWeights"],
    },
  );
export type PayoutConfigInput = z.infer<typeof PayoutConfigSchema>;

// ============================================================
// Step 1: Repo selection (client carries this through to submit)
// ============================================================

export const RepoSelectionSchema = z.object({
  ghRepoId: z.string().min(1),
  ghOwner: z.string().min(1),
  ghRepo: z.string().min(1),
  ghInstallationId: z.string().optional(),
  ownerAvatarUrl: z.string().url().optional(),
  description: z.string().nullable().optional(),
});
export type RepoSelection = z.infer<typeof RepoSelectionSchema>;

// ============================================================
// POST /api/projects body
// ============================================================

export const CreateProjectBodySchema = z.object({
  ghOwner: z.string().min(1),
  ghRepo: z.string().min(1),
  ghRepoId: z.string().min(1),
  ghInstallationId: z.string().optional(),
  launchWalletAddress: z.string().min(32).max(64).optional(),
  name: z.string().trim().min(1).max(32),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/),
  description: z.string().trim().min(1).max(1000),
  imageUrl: z.string().url(),
  website: z.string().url().optional(),
  twitter: z.string().trim().url().max(200).optional(),
  telegram: z.string().trim().url().max(200).optional(),
  scoringConfig: ScoringConfigSchema,
  payoutConfig: PayoutConfigSchema,
  platformFeeBps: z.number().int().min(0).max(10_000),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const CreateProjectResponseSchema = z.object({
  projectId: z.string(),
  status: z.literal("draft"),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

// ============================================================
// PATCH /api/projects/[id] body — partial draft update
// ============================================================

/**
 * Whitelisted fields the wizard's "Save draft" action can update on an
 * existing draft. Repo identity (ghOwner/ghRepo/ghRepoId) is intentionally
 * locked once the draft is created — to change repo, discard and start over.
 */
export const UpdateDraftBodySchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/)
    .optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  imageUrl: z.string().url().optional(),
  website: z.string().url().max(500).optional().or(z.literal("")),
  twitter: z.string().trim().url().max(200).optional().or(z.literal("")),
  telegram: z.string().trim().url().max(200).optional().or(z.literal("")),
  scoringConfig: ScoringConfigSchema.optional(),
  payoutConfig: PayoutConfigSchema.optional(),
  platformFeeBps: z.number().int().min(0).max(10_000).optional(),
});
export type UpdateDraftBody = z.infer<typeof UpdateDraftBodySchema>;

// ============================================================
// GET /api/projects/[id] response — minimum needed to rehydrate the wizard.
// Mirrors the projects table; the API endpoint already returns this shape
// (see apps/web/app/api/projects/[id]/route.ts), schema added here so the
// wizard hydration path can validate it on the client.
// ============================================================

export const DraftProjectRecordSchema = z.object({
  id: z.string(),
  ghOwner: z.string(),
  ghRepo: z.string(),
  ghRepoId: z.string(),
  ghInstallationId: z.string().nullable(),
  name: z.string(),
  symbol: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  tokenWebsiteUrl: z.string().nullable(),
  tokenTwitterUrl: z.string().nullable(),
  tokenTelegramUrl: z.string().nullable(),
  tokenMint: z.string().nullable(),
  bagsLaunchId: z.string().nullable(),
  bagsConfigKey: z.string().nullable(),
  status: z.enum([
    "draft",
    "launch_configured",
    "live",
    "paused",
    "killed",
    "simulated_live",
  ]),
  platformFeeBps: z.number().int(),
  scoringConfig: ScoringConfigSchema,
  payoutConfig: PayoutConfigSchema,
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type DraftProjectRecord = z.infer<typeof DraftProjectRecordSchema>;

// ============================================================
// POST /api/projects/[id]/launch response
// ============================================================

export const LaunchProjectResponseSchema = z.object({
  projectId: z.string(),
  tokenMint: z.string(),
  status: z.enum(["launch_configured", "live", "simulated_live"]),
  stub: z.boolean().default(false),
  requiresSignature: z.boolean().optional(),
  transactionBase64: z.string().optional(),
  launchWalletAddress: z.string().min(32).max(64).optional(),
  initialBuyLamports: z.number().int().min(0).optional(),
  configKey: z.string().optional(),
  txSig: z.string().nullable().optional(),
  note: z.string().optional(),
});
export type LaunchProjectResponse = z.infer<typeof LaunchProjectResponseSchema>;

// ============================================================
// GET /api/github/me/repos response
// ============================================================

export const GithubRepoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stargazersCount: z.number().int(),
  forksCount: z.number().int(),
  ownerAvatarUrl: z.string().url(),
  alreadyLaunched: z.boolean().default(false),
  // Set to the project id when the repo has an in-progress draft
  // (status `draft` or `launch_configured`). UI uses this to render a
  // "Continue draft" link instead of disabling the row.
  draftProjectId: z.string().nullable().default(null),
  homepage: z.string().nullable().default(null),
  topics: z.array(z.string()).default([]),
  license: z.string().nullable().default(null),
  defaultBranch: z.string().nullable().default(null),
});
export type GithubRepo = z.infer<typeof GithubRepoSchema>;

export const GithubReposResponseSchema = z.object({
  repos: z.array(GithubRepoSchema),
  visibilityNote: z.string().optional(),
});
export type GithubReposResponse = z.infer<typeof GithubReposResponseSchema>;

// GET /api/github/me/repos/[owner]/[repo]/enrich — slow per-repo enrichment
// pulled lazily after the user picks a repo. The list endpoint already returns
// the cheap fields above; enrichment adds owner social links + a cleaned
// README excerpt + the GitHub-generated OG banner image URL.
export const RepoEnrichmentSchema = z.object({
  ownerTwitterUsername: z.string().nullable(),
  ownerBlog: z.string().nullable(),
  readmeExcerpt: z.string().nullable(),
  ogImageUrl: z.string().url().nullable(),
});
export type RepoEnrichment = z.infer<typeof RepoEnrichmentSchema>;

// ============================================================
// Defaults — mirrored on client + server so the wizard renders
// the same starting state the API will accept.
// ============================================================

export const DEFAULT_TOP_N = 10;
export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_PLATFORM_FEE_BPS = 0;
export const DEFAULT_CLAIM_THRESHOLD_LAMPORTS = 100_000_000; // 0.1 SOL
export const LAMPORTS_PER_SOL_NUMBER = 1_000_000_000;

/** v1.1 default — 3 days between BPS rebalances after the initial ramp-up. */
export const DEFAULT_STEADY_STATE_CADENCE_HOURS: SteadyStateCadenceHours = 72;
/** v1.1 default — at most 50 contributor slots filled at launch (capped at 100). */
export const DEFAULT_MAX_CLAIMERS = 50;
export const MAX_CLAIMERS = 100;

/**
 * Default tier weights for an arbitrary topN. Top 1=30%, Top 2=20%, Top 3=15%,
 * remaining `topN-3` slots split the remaining 35%. For topN=10 this matches
 * the PRD-published [0.30, 0.20, 0.15, 0.05 × 7].
 *
 * For other topN values we scale linearly to maintain the 1.0 invariant.
 */
export function defaultTierWeights(topN: number): number[] {
  if (topN < 3) {
    // Should never happen — schema enforces min 3 — but stay safe.
    return Array.from({ length: topN }, () => 1 / Math.max(1, topN));
  }
  const head = [0.3, 0.2, 0.15];
  const remainingSlots = topN - 3;
  if (remainingSlots === 0) {
    // Renormalize head to 1.0 (would only matter if someone reduced topN to
    // 3, in which case the head sums to 0.65 — distribute the remaining 0.35
    // evenly across the head).
    const headSum = head.reduce((a, b) => a + b, 0);
    return head.map((w) => w / headSum);
  }
  const remainingTotal = 1 - head.reduce((a, b) => a + b, 0); // 0.35
  const tail = Array.from(
    { length: remainingSlots },
    () => remainingTotal / remainingSlots,
  );
  return [...head, ...tail];
}

export const DEFAULT_SCORING_CONFIG: ScoringConfigInput = {
  formulaVersion: "v0",
  windowDays: DEFAULT_WINDOW_DAYS,
  weights: {
    mergedPRs: 3.0,
    commits: 1.0,
    reviews: 1.5,
    issues: 0.5,
    netLines: 0.2,
  },
  decay: "linear",
  botBlocklist: [],
  botAllowlist: [],
};
