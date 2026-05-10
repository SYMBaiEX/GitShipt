import {
  pgEnum,
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { createId } from "@repo/lib";

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  // Bags metadata + fee-share config exist, but the final token launch
  // transaction has not been broadcast. Not eligible for payouts.
  "launch_configured",
  "live",
  "paused",
  "killed",
  // Project was "launched" in stub mode (no Bags credentials or no Solana
  // signer) — tokenMint / bagsLaunchId / bagsConfigKey are placeholders. A
  // real launch promotes this row by clearing those columns and setting
  // status back to 'draft' (see app/api/admin/promote-from-stub).
  "simulated_live",
  // Externally-launched Bags token we index for explore/search but do not
  // operate. No payouts, no snapshots, no fee claims — workflows must
  // exclude this status. Owned by the synthetic system user.
  "tracked",
]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "project_owner",
  "project_moderator",
]);

export interface ScoringConfigWeights {
  mergedPRs: number;
  commits: number;
  reviews: number;
  issues: number;
  netLines: number;
  /** v1: count of others' PRs the contributor approved-and-merged. */
  merges?: number;
  /** v1: length + anchor density + suggestion count, summed. */
  reviewSubstantiveScore?: number;
  /** v1: commits where contributor appears in Co-authored-by trailer. */
  coAuthored?: number;
}

export interface SubstantiveReviewFloor {
  minBodyChars: number;
  minAnchoredComments: number;
}

export interface ScoringConfig {
  formulaVersion: "v0" | "v1";
  windowDays: number;
  weights: ScoringConfigWeights;
  decay: "off" | "linear" | "exponential";
  /** v1: max commits per merged PR that earn credit. Default 5. */
  perPrCommitCap?: number;
  /** v1: max merged PRs per contributor per snapshot day that earn full
   *  credit. Excess carry-forward to the period they merge in. Default 10. */
  perWindowPrCap?: number;
  /** v1: enable the §6.5 draft auto-review pipeline. Default true. */
  draftQueueEnabled?: boolean;
  /** v1: hours an open draft must be unmodified before processDraftQueue
   *  runs auto-review heuristics on it. Default 24. */
  draftAutoReviewDelayHours?: number;
  /** v1: skip whitespace-only / lockfile-only / generated-output commits. */
  trivialCommitFilter?: boolean;
  /** v1: thresholds for a review to count as "substantive". */
  substantiveReviewFloor?: SubstantiveReviewFloor;
  botBlocklist: string[];
  botAllowlist: string[];
}

export interface AlignmentConfig {
  enabled: boolean;
  mode: "informational" | "asymmetric";
  floor: number;
  ceiling: number;
  belowFloorMultiplier: number;
  aboveCeilingMultiplier: number;
  signals: {
    linkedOpenIssue: number;
    priorityLabelMatch: number;
    fileAreaMatch: number;
    maintainerRequested: number;
    closedWithoutMerge: number;
    nonGoalAreaTouch: number;
    ciFirstPushPass: number;
    ciCoveragePositive: number;
    ciCoverageNegative: number;
    ciBrokeMain: number;
  };
  priorityLabels: string[];
  priorityFileAreas: string[];
  nonGoalFileAreas: string[];
  issueLinkPolicy: "required" | "encouraged" | "optional";
}

export interface AgentRoutingPolicy {
  defaultPolicy: "treasury" | "reject" | "split";
  splitTreasuryShare: number;
  operatorShareCap: number;
  bindings: Array<{
    botGhLogin: string;
    operatorGhUserId: string;
    operatorWalletAddress: string | null;
    boundAt: string;
    cosignedBy: string[];
  }>;
  acceptCoAuthorTrailerCredit: boolean;
  coAuthorSplitRatio: number;
}

export interface CommunityLinks {
  discord?: { inviteUrl: string; verificationPolicy?: string };
  telegram?: { inviteUrl: string };
  x?: { handle: string };
  custom?: Array<{ label: string; url: string }>;
}

export interface InstallPreferences {
  shipshapeMd: true; // required, locked
  workflowYml: true; // required, locked
  readmeBadge: boolean;
  claudeMd: boolean;
  cursorRules: boolean;
  copilotInstructions: boolean;
  agentsMd: boolean;
}

export interface PayoutConfig {
  topN: number;
  tierWeights: number[]; // must sum to 1.0
  claimThresholdLamports: number;
  /** v1 (shipshape §6.7): if set, contributors whose period payout exceeds
   *  this value must have communityVerified = true to receive payout. Below
   *  this value, paid normally. Off by default. */
  communityVerifiedThresholdLamports?: number;
  /**
   * hours between BPS rebalances after the 24h-then-3d ramp-up.
   * Optional during transition; written from the launch wizard's
   * CadenceSelector. Mirrored onto payout_schedules.steadyStateCadenceHours.
   */
  steadyStateCadenceHours?: 72 | 120 | 168;
  /**
   * maximum contributor claimer slots filled at launch.
   */
  maxClaimers?: number;
  /**
   * platform fee in BPS (mirrored from the wizard onto
   * `bags_fee_share_configs.adminPubkey` config). Optional during
   * transition; null in legacy v1.0 rows.
   */
  platformFeeBps?: number;
}

/**
 * Project launch state machine (shipshape design doc §12). Every transition
 * re-verifies the launching user's GitHub admin permission on the target
 * repo; the gate fails closed.
 */
export const projectLaunchStateEnum = pgEnum("project_launch_state", [
  "pending_install",
  "awaiting_pr_merge",
  "ready_to_launch",
  "launched",
  "failed",
]);

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    // GitHub
    ghOwner: text("gh_owner").notNull(),
    ghRepo: text("gh_repo").notNull(),
    ghRepoId: text("gh_repo_id").notNull(),
    ghInstallationId: text("gh_installation_id"),
    /** Soft FK to organizations.gh_org_id when the repo is org-owned.
     *  Null for user-namespace repos. (shipshape §14.5) */
    ghOrgId: text("gh_org_id"),

    // Display
    name: text("name").notNull(),
    /** Token ticker. Captured during draft so resume preserves it; written to
     *  Bags metadata at launch time. */
    symbol: text("symbol"),
    description: text("description"),
    imageUrl: text("image_url"),

    // Bags / on-chain
    tokenMint: text("token_mint"),
    bagsLaunchId: text("bags_launch_id"),
    bagsConfigKey: text("bags_config_key"),
    bagsLaunchSignature: text("bags_launch_signature"),
    bagsLaunchWallet: text("bags_launch_wallet"),
    bagsPoolClaimerWallet: text("bags_pool_claimer_wallet"),
    bagsTokenMetadata: text("bags_token_metadata"),
    bagsInitialBuyLamports: integer("bags_initial_buy_lamports")
      .notNull()
      .default(0),
    tokenWebsiteUrl: text("token_website_url"),
    tokenTwitterUrl: text("token_twitter_url"),
    tokenTelegramUrl: text("token_telegram_url"),

    // Status + config
    status: projectStatusEnum("status").notNull().default("draft"),
    platformFeeBps: integer("platform_fee_bps").notNull().default(0),
    scoringConfig: jsonb("scoring_config").$type<ScoringConfig>().notNull(),
    payoutConfig: jsonb("payout_config").$type<PayoutConfig>().notNull(),
    /** v1 (shipshape §8). Owner-configurable alignment policy with the
     *  asymmetric multiplier as default. Snapshotted from organization
     *  defaults at project creation time. */
    alignmentConfig: jsonb("alignment_config").$type<AlignmentConfig>(),
    /** v1 (shipshape §6.1, §5.5). Per-bot operator bindings + per-project
     *  attribution policy. Snapshotted from organization defaults. */
    agentRoutingPolicy: jsonb(
      "agent_routing_policy",
    ).$type<AgentRoutingPolicy>(),
    /** v1 (shipshape §6.7). Discord/Telegram/X/custom links surfaced in
     *  shipshape.md as advised due-diligence channels. */
    communityLinks: jsonb("community_links").$type<CommunityLinks>(),
    /** v1 (shipshape §13.4). Owner's per-file install opt-in/out at App
     *  install time. Re-runs honor previous selections. */
    installPreferences: jsonb(
      "install_preferences",
    ).$type<InstallPreferences>(),

    /** v1 (shipshape §12). Launch state machine. */
    launchState: projectLaunchStateEnum("launch_state"),
    /** PR opened by the GitShipt App during install. */
    installRunbookPullRequestUrl: text("install_runbook_pr_url"),
    installRunbookPullRequestNumber: integer("install_runbook_pr_number"),
    /** GitHub user id of the user who triggered install (must be admin at
     *  launch time per §12; re-verified live). */
    installerGhUserId: text("installer_gh_user_id"),

    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedReason: text("paused_reason"),
    killedAt: timestamp("killed_at", { withTimezone: true }),
    /** Set when the project was launched in stub mode; null after a real launch. */
    simulatedAt: timestamp("simulated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ghRepoUq: uniqueIndex("projects_gh_repo_uq").on(t.ghOwner, t.ghRepo),
    statusIdx: index("projects_status_idx").on(t.status),
    ownerIdx: index("projects_owner_idx").on(t.ownerUserId),
    /** Cheap filter for the org dashboard (§14.5). */
    ghOrgIdIdx: index("projects_gh_org_id_idx").on(t.ghOrgId),
    launchStateIdx: index("projects_launch_state_idx").on(t.launchState),
    trackedHasNoLaunchState: check(
      "projects_tracked_has_no_launch_state",
      sql`${t.status} <> 'tracked' OR ${t.launchState} IS NULL`,
    ),
    installStateHasMetadata: check(
      "projects_install_state_has_metadata",
      sql`${t.launchState} IS NULL OR ${t.launchState} NOT IN ('awaiting_pr_merge', 'ready_to_launch') OR (${t.installerGhUserId} IS NOT NULL AND ${t.installRunbookPullRequestUrl} IS NOT NULL AND ${t.installRunbookPullRequestNumber} IS NOT NULL)`,
    ),
  }),
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: projectMemberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userProjectUq: uniqueIndex("memberships_user_project_uq").on(
      t.userId,
      t.projectId,
    ),
    projectIdx: index("memberships_project_idx").on(t.projectId),
  }),
);
