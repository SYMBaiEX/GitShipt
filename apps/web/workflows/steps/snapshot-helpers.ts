/**
 * Snapshot pipeline DB helpers. These are NOT step functions — they're
 * called from inside `'use step'` blocks in workflows/takeSnapshot.ts.
 *
 * All return values are JSON-serializable (no Date instances; bigints as
 * decimal strings) so they survive workflow step boundaries.
 */
import { FatalError } from "workflow";
import { dbHttp } from "@/db";
import {
  contributors,
  projects,
  snapshots,
  contributorClaims,
  wallets,
  platformConfig,
} from "@/db/schema";
import type { ScoringConfig, PayoutConfig } from "@/db/schema/projects";
import type { LeaderboardEntry } from "@/db/schema/snapshots";
import type { ContributorScoreInputs } from "@/db/schema/contributors";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  buildLeaderboardEntries,
  type SnapshotContributor,
} from "@/lib/payouts/distribution";
import { computeMerkleRoot } from "@/lib/payouts/merkle";
import { enterDbWorkflowContext } from "@/lib/db-rls";
import type { WorkflowLock } from "@/lib/workflow-locks";

export type { WorkflowLock };

const SNAPSHOT_PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const activeSnapshotPeriodPredicate = sql`status in ('pending', 'frozen', 'paid')`;
const TREASURY_ROUTED_AGENT_REASON = "treasury_routed_agent";

export interface LoadedProjectForSnapshot {
  id: string;
  name: string;
  status:
    | "draft"
    | "launch_configured"
    | "live"
    | "paused"
    | "killed"
    | "tracked"
    | "simulated_live";
  tokenMint: string | null;
  bagsPoolClaimerWallet: string | null;
  platformFeeBps: number;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
}

/** Projects with status='live' that have at least one ranked contributor. */
export async function loadEligibleProjectIds(): Promise<string[]> {
  "use step";
  enterDbWorkflowContext("snapshot-helpers:loadEligibleProjectIds");
  const rows = await dbHttp.execute<{ id: string }>(sql`
    select p.id::text as id
    from projects p
    where p.status = 'live'
      and exists (
        select 1 from contributors c
        where c.project_id = p.id
          and c.rank is not null
          and c.excluded = 'false'
      )
  `);
  return rows.rows.map((r) => r.id);
}

export async function loadProjectForSnapshot(
  projectId: string,
): Promise<LoadedProjectForSnapshot | null> {
  "use step";
  enterDbWorkflowContext("snapshot-helpers:loadProjectForSnapshot");
  const [row] = await dbHttp
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      tokenMint: projects.tokenMint,
      bagsPoolClaimerWallet: projects.bagsPoolClaimerWallet,
      platformFeeBps: projects.platformFeeBps,
      scoringConfig: projects.scoringConfig,
      payoutConfig: projects.payoutConfig,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/**
 * Top-N contributors for a project (rank ASC, excluded=false, rank not null).
 * Returns SnapshotContributor[] suitable for buildLeaderboardEntries.
 */
export async function loadRankedContributors(
  projectId: string,
  topN: number,
): Promise<SnapshotContributor[]> {
  "use step";
  enterDbWorkflowContext("snapshot-helpers:loadRankedContributors");
  const limit = Math.max(0, Math.floor(topN));
  if (limit === 0) return [];
  const rows = await dbHttp
    .select({
      id: contributors.id,
      ghUserId: contributors.ghUserId,
      ghUsername: contributors.ghUsername,
      rank: contributors.rank,
      score: contributors.score,
      inputs: contributors.inputs,
      excludedReason: contributors.excludedReason,
    })
    .from(contributors)
    .where(
      and(
        eq(contributors.projectId, projectId),
        eq(contributors.excluded, "false"),
        isNotNull(contributors.rank),
      ),
    )
    .orderBy(contributors.rank)
    .limit(limit);

  return rows
    .filter((r): r is typeof r & { rank: number } => r.rank !== null)
    .map((r) => ({
      id: r.id,
      ghUserId: r.ghUserId,
      ghUsername: r.ghUsername,
      rank: r.rank,
      score: r.score,
      payoutRoute:
        r.excludedReason === TREASURY_ROUTED_AGENT_REASON
          ? "treasury"
          : "contributor",
      payoutRouteReason: r.excludedReason ?? undefined,
      inputs: r.inputs as ContributorScoreInputs,
    }));
}

export interface FreezeSnapshotResult {
  snapshotId: string;
  snapshotPeriod: string;
  takenAtISO: string;
  merkleRoot: string;
  leaderboardCount: number;
  created: boolean;
}

export function snapshotPeriodKey(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error("snapshotPeriodKey: invalid date");
  }
  return date.toISOString().slice(0, 10);
}

function normalizeSnapshotPeriod(
  snapshotPeriod: string | undefined,
  takenAt: Date,
): string {
  const period = snapshotPeriod ?? snapshotPeriodKey(takenAt);
  if (!SNAPSHOT_PERIOD_PATTERN.test(period)) {
    throw new Error("freezeSnapshot: snapshotPeriod must be YYYY-MM-DD");
  }
  return period;
}

/**
 * Insert a frozen snapshot row or return the existing active row for this UTC
 * period. The DB partial unique index on (projectId, snapshotPeriod) is the
 * durable guarantee that retries cannot create duplicate payout candidates.
 */
export async function freezeSnapshot(args: {
  projectId: string;
  formulaVersion: string;
  leaderboard: LeaderboardEntry[];
  snapshotPeriod?: string;
  takenAtISO?: string;
}): Promise<FreezeSnapshotResult> {
  "use step";
  enterDbWorkflowContext("snapshot-helpers:freezeSnapshot");
  const takenAt = args.takenAtISO ? new Date(args.takenAtISO) : new Date();
  const snapshotPeriod = normalizeSnapshotPeriod(args.snapshotPeriod, takenAt);
  const merkleRoot = await computeMerkleRoot(
    args.leaderboard.map((e) => ({
      contributorId: e.contributorId,
      // weight gets us to a per-contributor target; for snapshot integrity
      // we hash the (contributorId, weight) projection so the root depends
      // on the rank ordering AND the tier weights chosen at snapshot time.
      // Amount-in-lamports isn't known yet (no claim total) — Merkle root
      // is updated to the amount tree at payout time inside executePayout.
      amountLamports: BigInt(Math.round(e.weight * 1_000_000_000)),
    })),
  );

  const [inserted] = await dbHttp
    .insert(snapshots)
    .values({
      projectId: args.projectId,
      snapshotPeriod,
      takenAt,
      formulaVersion: args.formulaVersion,
      leaderboard: args.leaderboard,
      merkleRoot,
      totalFeesLamports: 0n,
      status: "frozen",
      forced: "false",
    })
    .onConflictDoNothing({
      target: [snapshots.projectId, snapshots.snapshotPeriod],
      where: activeSnapshotPeriodPredicate,
    })
    .returning({ id: snapshots.id });

  if (inserted) {
    return {
      snapshotId: inserted.id,
      snapshotPeriod,
      takenAtISO: takenAt.toISOString(),
      merkleRoot,
      leaderboardCount: args.leaderboard.length,
      created: true,
    };
  }

  const [existing] = await dbHttp
    .select({
      id: snapshots.id,
      takenAt: snapshots.takenAt,
      merkleRoot: snapshots.merkleRoot,
      leaderboard: snapshots.leaderboard,
    })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.projectId, args.projectId),
        eq(snapshots.snapshotPeriod, snapshotPeriod),
        activeSnapshotPeriodPredicate,
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("freezeSnapshot: period conflict row missing");
  }

  return {
    snapshotId: existing.id,
    snapshotPeriod,
    takenAtISO: existing.takenAt.toISOString(),
    merkleRoot: existing.merkleRoot,
    leaderboardCount: existing.leaderboard.length,
    created: false,
  };
}

/**
 * Bulk-load wallet addresses for a set of contributorIds.
 * Returns a map { [contributorId]: walletAddress | null }.
 *
 * Joins contributor_claims (linked user) with wallets (primary wallet for
 * that user). When a contributor has no claim or the user has no wallet,
 * the entry is missing from the map (callers treat as null).
 */
export async function loadContributorWallets(
  contributorIds: string[],
): Promise<Record<string, string>> {
  "use step";
  enterDbWorkflowContext("snapshot-helpers:loadContributorWallets");
  if (contributorIds.length === 0) return {};
  const rows = await dbHttp
    .select({
      contributorId: contributorClaims.contributorId,
      walletAddress: wallets.address,
      isPrimary: wallets.isPrimary,
    })
    .from(contributorClaims)
    .innerJoin(wallets, eq(wallets.userId, contributorClaims.userId))
    .where(
      sql`${contributorClaims.contributorId} = any(${contributorIds}::text[])`,
    );

  // Prefer is_primary='true' when a user has multiple wallets.
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!map[r.contributorId] || r.isPrimary === "true") {
      map[r.contributorId] = r.walletAddress;
    }
  }
  return map;
}

// Re-export pure helpers for workflow callsites.
export { buildLeaderboardEntries };

// ============================================================
// Workflow step wrappers — each carries the `"use step"` directive
// so workflows/takeSnapshot.ts can import them and stay free of
// Node-only imports at the file top.
// ============================================================

export async function snapshotAcquireLockStep(
  workflowName: string,
  scope: string,
  ttlSeconds: number,
): Promise<WorkflowLock> {
  "use step";
  const { acquireWorkflowLock } = await import("@/lib/workflow-locks");
  return await acquireWorkflowLock(workflowName, scope, ttlSeconds);
}

export async function snapshotReleaseLockStep(
  lock: WorkflowLock,
): Promise<void> {
  "use step";
  const { releaseWorkflowLock } = await import("@/lib/workflow-locks");
  await releaseWorkflowLock(lock);
}

export async function snapshotAssertNotKilled(): Promise<void> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:assertNotKilled");
  const { isKillSwitchEnabled } = await import("@/lib/kill-switch");
  const killed = await isKillSwitchEnabled();
  if (killed) {
    throw new FatalError("kill_switch_enabled: takeSnapshot aborted");
  }
}

export async function snapshotHeartbeatStep(name: string): Promise<void> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:heartbeat");
  const at = new Date().toISOString();
  await dbHttp
    .insert(platformConfig)
    .values({
      key: `heartbeat.${name}`,
      value: { lastBeatAt: at, source: "takeSnapshot" },
    })
    .onConflictDoUpdate({
      target: platformConfig.key,
      set: {
        value: sql`excluded.value`,
        updatedAt: sql`now()`,
      },
    });
}

export async function loadEligibleProjectIdsStep(): Promise<string[]> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:loadEligibleProjectIds");
  return await loadEligibleProjectIds();
}

export async function loadProjectStep(
  projectId: string,
): ReturnType<typeof loadProjectForSnapshot> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:loadProject");
  return await loadProjectForSnapshot(projectId);
}

export async function loadContributorsStep(
  projectId: string,
  topN: number,
): ReturnType<typeof loadRankedContributors> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:loadContributors");
  return await loadRankedContributors(projectId, topN);
}

export async function freezeStep(
  args: Parameters<typeof freezeSnapshot>[0],
): ReturnType<typeof freezeSnapshot> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:freeze");
  return await freezeSnapshot(args);
}

export async function snapshotRevalidateProjectCachesStep(
  projectId: string,
): Promise<void> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:revalidateProjectCaches");
  const { revalidateProjectCaches } = await import("@/lib/cache");
  await revalidateProjectCaches(projectId);
}

/**
 * Write the period_digest feed entry for the snapshot we just froze.
 * Idempotent on (project_id, kind, period) UNIQUE — re-running the workflow
 * (cron retry, force-snapshot, race) will not create duplicates.
 *
 * Errors here are non-fatal: the feed is downstream of the canonical
 * snapshot, so a failure to render the digest must not poison the
 * snapshot-paid path. We capture and continue.
 */
export async function snapshotWriteFeedDigestStep(
  snapshotId: string,
): Promise<void> {
  "use step";
  enterDbWorkflowContext("takeSnapshot:writeFeedDigest");
  if (!snapshotId) return;
  try {
    const { writePeriodDigestForSnapshot } = await import("@/lib/feed/writer");
    await writePeriodDigestForSnapshot(snapshotId);
  } catch (err) {
    // Don't propagate: feed write failures must not gate snapshot finalize.
    const { captureException } = await import("@/lib/observability");
    captureException(err, {
      area: "feed.write_period_digest",
      tags: { snapshotId },
    });
  }
}

/**
 * `start()` cannot run inside workflow context — wrap it in a step. Spawns the
 * per-project child workflow for each eligible project.
 */
export async function startTakeProjectSnapshotStep(
  projectId: string,
): Promise<void> {
  "use step";
  const { start } = await import("workflow/api");
  const { takeProjectSnapshot } = await import("../takeSnapshot");
  await start(takeProjectSnapshot, [projectId]);
}
