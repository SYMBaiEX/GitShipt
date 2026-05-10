import "server-only";
import { dbHttp } from "@/db";
import {
  projects,
  contributors,
  contributorClaims,
  payouts,
  payoutRecipients,
  wallets,
  ghIndexerState,
  projectMemberships,
  users,
  type ScoringConfig,
  type PayoutConfig,
} from "@/db/schema";
import type { ProjectRole } from "@/lib/auth/permissions";
import { cacheLife, cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache";
import { and, desc, eq, sql, isNotNull, or, inArray } from "drizzle-orm";
import { PayoutConfigSchema, ScoringConfigSchema } from "@repo/shared";
import { z } from "zod";

/**
 * Query helpers for the project admin console (`/dashboard/**`).
 *
 * All reads use the HTTP driver — no transactional state to maintain — and
 * are scoped to `userId` so a leaked or compromised session cannot enumerate
 * other people's projects.
 */

const LimitSchema = z.number().int().min(1).max(500);
const ProjectStatusSchema = z.enum([
  "draft",
  "launch_configured",
  "live",
  "paused",
  "killed",
  "simulated_live",
]);

function safeLimit(limit: number, fallback: number): number {
  return LimitSchema.catch(fallback).parse(limit);
}

function parseProjectStatus(status: unknown): MyProjectRow["status"] {
  return ProjectStatusSchema.parse(status);
}

function parseScoringConfig(value: unknown): ScoringConfig {
  return ScoringConfigSchema.parse(value) satisfies ScoringConfig;
}

function parsePayoutConfig(value: unknown): PayoutConfig {
  return PayoutConfigSchema.parse(value) satisfies PayoutConfig;
}

export interface MyProjectRow {
  id: string;
  slug: string; // `${ghOwner}/${ghRepo}`
  ghOwner: string;
  ghRepo: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status:
    | "draft"
    | "launch_configured"
    | "live"
    | "paused"
    | "killed"
    | "simulated_live";
  tokenMint: string | null;
  contributorsCount: number;
  lifetimeFeesLamports: bigint;
  lastPayoutAt: Date | null;
  createdAt: Date;
}

/**
 * List every project the user owns OR has a project_membership in.
 * Counts contributors and sums confirmed payout lamports per project in two
 * follow-up queries (avoids N+1 by batching with `inArray`).
 */
async function getMyProjectsUncached(userId: string): Promise<MyProjectRow[]> {
  // 1. Find project IDs the user is owner or member of.
  const ownedRows = await dbHttp
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerUserId, userId));

  const memberRows = await dbHttp
    .select({ id: projectMemberships.projectId })
    .from(projectMemberships)
    .where(eq(projectMemberships.userId, userId));

  const ids = Array.from(
    new Set([...ownedRows.map((r) => r.id), ...memberRows.map((r) => r.id)]),
  );
  if (ids.length === 0) return [];

  const rows = await dbHttp
    .select()
    .from(projects)
    .where(inArray(projects.id, ids));

  // 2. Per-project contributor count (single grouped query).
  const counts = await dbHttp
    .select({
      projectId: contributors.projectId,
      n: sql<number>`count(*)::int`,
    })
    .from(contributors)
    .where(inArray(contributors.projectId, ids))
    .groupBy(contributors.projectId);
  const countMap = new Map(counts.map((r) => [r.projectId, r.n]));

  // 3. Per-project lifetime fees + last completed payout.
  const payoutAgg = await dbHttp
    .select({
      projectId: payouts.projectId,
      lifetime: sql<string>`coalesce(sum(${payouts.totalAmountLamports}), 0)::text`,
      lastAt: sql<Date | null>`max(${payouts.executedAt})`,
    })
    .from(payouts)
    .where(
      and(inArray(payouts.projectId, ids), eq(payouts.status, "completed")),
    )
    .groupBy(payouts.projectId);
  const payoutMap = new Map(
    payoutAgg.map((r) => [
      r.projectId,
      { lifetime: BigInt(r.lifetime ?? "0"), lastAt: r.lastAt },
    ]),
  );

  return rows.map((r) => {
    const agg = payoutMap.get(r.id);
    return {
      id: r.id,
      slug: `${r.ghOwner}/${r.ghRepo}`,
      ghOwner: r.ghOwner,
      ghRepo: r.ghRepo,
      name: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      status: parseProjectStatus(r.status),
      tokenMint: r.tokenMint,
      contributorsCount: countMap.get(r.id) ?? 0,
      lifetimeFeesLamports: agg?.lifetime ?? 0n,
      lastPayoutAt: agg?.lastAt ?? null,
      createdAt: r.createdAt,
    };
  });
}

export async function getMyProjects(userId: string): Promise<MyProjectRow[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return await getMyProjectsUncached(userId);
}

export interface ProjectKPIs {
  totalContributorsRanked: number;
  totalPayoutsExecuted: number;
  lifetimeFeesLamports: bigint;
  pendingEscrowLamports: bigint;
  lastSnapshotAt: Date | null;
  nextPayoutAt: Date;
}

function nextPayoutAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(0, 30, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

async function getProjectKPIsUncached(projectId: string): Promise<ProjectKPIs> {
  const [contribCountRows, payoutAggRows, escrowRows, lastSnapRows] =
    await Promise.all([
      dbHttp
        .select({ n: sql<number>`count(*)::int` })
        .from(contributors)
        .where(
          and(
            eq(contributors.projectId, projectId),
            isNotNull(contributors.rank),
          ),
        ),
      dbHttp
        .select({
          n: sql<number>`count(*)::int`,
          lifetime: sql<string>`coalesce(sum(${payouts.totalAmountLamports}), 0)::text`,
        })
        .from(payouts)
        .where(
          and(
            eq(payouts.projectId, projectId),
            eq(payouts.status, "completed"),
          ),
        ),
      // Bags-native: no off-chain escrow surface. Always zero.
      Promise.resolve([{ total: "0" }] as const),
      dbHttp
        .select({ at: sql<Date | null>`max(executed_at)` })
        .from(payouts)
        .where(eq(payouts.projectId, projectId)),
    ]);

  return {
    totalContributorsRanked: contribCountRows[0]?.n ?? 0,
    totalPayoutsExecuted: payoutAggRows[0]?.n ?? 0,
    lifetimeFeesLamports: BigInt(payoutAggRows[0]?.lifetime ?? "0"),
    pendingEscrowLamports: BigInt(escrowRows[0]?.total ?? "0"),
    lastSnapshotAt: lastSnapRows[0]?.at ?? null,
    nextPayoutAt: nextPayoutAt(),
  };
}

export async function getProjectKPIs(projectId: string): Promise<ProjectKPIs> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.projectPayouts(projectId));
  return await getProjectKPIsUncached(projectId);
}

export interface PayoutHistoryRow {
  id: string;
  executedAt: Date | null;
  status:
    | "pending"
    | "claiming"
    | "distributing"
    | "completed"
    | "failed"
    | "cancelled"
    | "simulated";
  totalLamports: bigint;
  recipientCount: number;
  claimSignature: string | null;
  snapshotId: string;
  attemptCount: number;
}

async function getProjectPayoutHistoryUncached(
  projectId: string,
  limit = 50,
): Promise<PayoutHistoryRow[]> {
  const safe = safeLimit(limit, 50);
  const rows = await dbHttp
    .select({
      id: payouts.id,
      executedAt: payouts.executedAt,
      status: payouts.status,
      totalLamports: payouts.totalAmountLamports,
      claimSignature: payouts.claimSignature,
      snapshotId: payouts.snapshotId,
      attemptCount: payouts.attemptCount,
      recipientCount: sql<number>`count(${payoutRecipients.id})::int`,
    })
    .from(payouts)
    .leftJoin(payoutRecipients, eq(payoutRecipients.payoutId, payouts.id))
    .where(eq(payouts.projectId, projectId))
    .groupBy(payouts.id)
    .orderBy(desc(payouts.scheduledAt))
    .limit(safe);

  return rows.map((r) => ({
    id: r.id,
    executedAt: r.executedAt,
    status: r.status,
    totalLamports: r.totalLamports,
    recipientCount: r.recipientCount ?? 0,
    claimSignature: r.claimSignature,
    snapshotId: r.snapshotId,
    attemptCount: r.attemptCount,
  }));
}

export async function getProjectPayoutHistory(
  projectId: string,
  limit = 50,
): Promise<PayoutHistoryRow[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.projectPayouts(projectId));
  return await getProjectPayoutHistoryUncached(projectId, safeLimit(limit, 50));
}

export interface MyEarnings {
  totalLifetimeLamports: bigint;
  pendingEscrowLamports: bigint;
  byProject: Array<{
    projectId: string;
    projectSlug: string;
    lifetimeLamports: bigint;
    escrowLamports: bigint;
  }>;
}

/**
 * Sum across every contributor row claimed by this user. A user can claim
 * many contributors (one per repo they've contributed to under their GitHub
 * identity).
 */
async function getMyEarningsUncached(userId: string): Promise<MyEarnings> {
  // Find contributor IDs claimed by this user.
  const claims = await dbHttp
    .select({ contributorId: contributorClaims.contributorId })
    .from(contributorClaims)
    .where(eq(contributorClaims.userId, userId));
  const contribIds = claims.map((c) => c.contributorId);

  if (contribIds.length === 0) {
    return {
      totalLifetimeLamports: 0n,
      pendingEscrowLamports: 0n,
      byProject: [],
    };
  }

  // Per-contributor lifetime sent + project slug.
  const lifetimeRows = await dbHttp
    .select({
      projectId: projects.id,
      projectSlug: sql<string>`${projects.ghOwner} || '/' || ${projects.ghRepo}`,
      lifetime: sql<string>`coalesce(sum(${payoutRecipients.amountLamports}) filter (where ${payoutRecipients.status} in ('sent','confirmed')), 0)::text`,
    })
    .from(payoutRecipients)
    .innerJoin(
      contributors,
      eq(contributors.id, payoutRecipients.contributorId),
    )
    .innerJoin(projects, eq(projects.id, contributors.projectId))
    .where(inArray(payoutRecipients.contributorId, contribIds))
    .groupBy(projects.id, projects.ghOwner, projects.ghRepo);

  // Bags-native architecture: contributors claim through Bags' UI; we no
  // longer hold contributor custody on their behalf. Pending custody is
  // structurally always zero. Once `bags_claim_events` is consumed by this
  // query, the lifetime side will switch to that source too.
  const escrowBySlug = new Map<string, { escrow: bigint; projectId: string }>();
  const lifetimeBySlug = new Map(
    lifetimeRows.map((r) => [
      r.projectSlug,
      { lifetime: BigInt(r.lifetime ?? "0"), projectId: r.projectId },
    ]),
  );

  const slugSet = new Set<string>([
    ...lifetimeBySlug.keys(),
    ...escrowBySlug.keys(),
  ]);

  const byProject = Array.from(slugSet).map((slug) => {
    const lifetimeData = lifetimeBySlug.get(slug);
    const escrowData = escrowBySlug.get(slug);
    const projectId = lifetimeData?.projectId ?? escrowData?.projectId ?? "";
    return {
      projectId,
      projectSlug: slug,
      lifetimeLamports: lifetimeData?.lifetime ?? 0n,
      escrowLamports: escrowData?.escrow ?? 0n,
    };
  });

  let total = 0n;
  let escrow = 0n;
  for (const p of byProject) {
    total += p.lifetimeLamports;
    escrow += p.escrowLamports;
  }

  return {
    totalLifetimeLamports: total,
    pendingEscrowLamports: escrow,
    byProject,
  };
}

export async function getMyEarnings(userId: string): Promise<MyEarnings> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return await getMyEarningsUncached(userId);
}

export interface LinkedWallet {
  id: string;
  address: string;
  chain: string;
  label: string | null;
  isPrimary: boolean;
  verifiedAt: Date;
}

async function getMyLinkedWalletsUncached(
  userId: string,
): Promise<LinkedWallet[]> {
  const rows = await dbHttp
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(desc(wallets.verifiedAt));
  return rows.map((r) => ({
    id: r.id,
    address: r.address,
    chain: r.chain,
    label: r.label,
    isPrimary: r.isPrimary === "true",
    verifiedAt: r.verifiedAt,
  }));
}

export async function getMyLinkedWallets(
  userId: string,
): Promise<LinkedWallet[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return await getMyLinkedWalletsUncached(userId);
}

/**
 * Resolve whether the given user owns a project (or is a member). Returns
 * the membership role string when present, else "owner" if owner, else null.
 */
export async function getUserProjectRole(
  userId: string,
  projectId: string,
): Promise<"owner" | ProjectRole | null> {
  const [proj] = await dbHttp
    .select({ ownerUserId: projects.ownerUserId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return null;
  if (proj.ownerUserId === userId) return "owner";
  const [m] = await dbHttp
    .select({ role: projectMemberships.role })
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.userId, userId),
        eq(projectMemberships.projectId, projectId),
      ),
    )
    .limit(1);
  return m?.role ?? null;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  ghOwner: string;
  ghRepo: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status:
    | "draft"
    | "launch_configured"
    | "live"
    | "paused"
    | "killed"
    | "simulated_live";
  tokenMint: string | null;
  bagsLaunchId: string | null;
  ghInstallationId: string | null;
  platformFeeBps: number;
  ownerUserId: string;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
  pausedAt: Date | null;
  pausedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function getProjectRecordUncached(
  projectId: string,
): Promise<ProjectRecord | null> {
  const [r] = await dbHttp
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    slug: `${r.ghOwner}/${r.ghRepo}`,
    ghOwner: r.ghOwner,
    ghRepo: r.ghRepo,
    name: r.name,
    description: r.description,
    imageUrl: r.imageUrl,
    status: parseProjectStatus(r.status),
    tokenMint: r.tokenMint,
    bagsLaunchId: r.bagsLaunchId,
    ghInstallationId: r.ghInstallationId,
    platformFeeBps: r.platformFeeBps,
    ownerUserId: r.ownerUserId,
    scoringConfig: parseScoringConfig(r.scoringConfig),
    payoutConfig: parsePayoutConfig(r.payoutConfig),
    pausedAt: r.pausedAt,
    pausedReason: r.pausedReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getProjectRecord(
  projectId: string,
): Promise<ProjectRecord | null> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  return await getProjectRecordUncached(projectId);
}

export interface RecentAuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

async function getRecentProjectAuditUncached(
  projectId: string,
  limit = 10,
): Promise<RecentAuditEntry[]> {
  const safe = safeLimit(limit, 10);
  const rows = await dbHttp
    .select({
      id: sql<string>`al.id`,
      action: sql<string>`al.action`,
      actorUserId: sql<string | null>`al.actor_user_id`,
      actorName: users.name,
      metadata: sql<Record<string, unknown>>`al.metadata`,
      createdAt: sql<Date>`al.created_at`,
    })
    .from(sql`audit_logs al`)
    .leftJoin(users, sql`${users.id} = al.actor_user_id`)
    .where(sql`al.target_type = 'project' and al.target_id = ${projectId}`)
    .orderBy(sql`al.created_at desc`)
    .limit(safe);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorUserId: r.actorUserId,
    actorName: r.actorName,
    metadata: r.metadata ?? {},
    createdAt: new Date(r.createdAt),
  }));
}

export async function getRecentProjectAudit(
  projectId: string,
  limit = 10,
): Promise<RecentAuditEntry[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.adminAudit);
  return await getRecentProjectAuditUncached(projectId, safeLimit(limit, 10));
}

export interface IndexerState {
  lastFullSyncAt: Date | null;
  lastIncrementalSyncAt: Date | null;
  lastCommitSha: string | null;
  lastError: string | null;
  isStale: boolean; // > 1h since last incremental
}

async function getIndexerStateUncached(
  projectId: string,
): Promise<IndexerState | null> {
  const [r] = await dbHttp
    .select()
    .from(ghIndexerState)
    .where(eq(ghIndexerState.projectId, projectId))
    .limit(1);
  if (!r) return null;
  const last = r.lastIncrementalSyncAt;
  const isStale = last == null || Date.now() - last.getTime() > 60 * 60 * 1000;
  return {
    lastFullSyncAt: r.lastFullSyncAt,
    lastIncrementalSyncAt: r.lastIncrementalSyncAt,
    lastCommitSha: r.lastCommitSha,
    lastError: r.lastError,
    isStale,
  };
}

export async function getIndexerState(
  projectId: string,
): Promise<IndexerState | null> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  return await getIndexerStateUncached(projectId);
}

export interface FailedPayoutAlert {
  id: string;
  scheduledAt: Date;
  attemptCount: number;
  lastError: string | null;
}

async function getFailedPayoutsForProjectUncached(
  projectId: string,
  limit = 5,
): Promise<FailedPayoutAlert[]> {
  const safe = safeLimit(limit, 5);
  const rows = await dbHttp
    .select({
      id: payouts.id,
      scheduledAt: payouts.scheduledAt,
      attemptCount: payouts.attemptCount,
      lastError: payouts.lastError,
    })
    .from(payouts)
    .where(and(eq(payouts.projectId, projectId), eq(payouts.status, "failed")))
    .orderBy(desc(payouts.scheduledAt))
    .limit(safe);
  return rows;
}

export async function getFailedPayoutsForProject(
  projectId: string,
  limit = 5,
): Promise<FailedPayoutAlert[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.projectPayouts(projectId));
  return await getFailedPayoutsForProjectUncached(
    projectId,
    safeLimit(limit, 5),
  );
}

export interface ProjectMemberRow {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: ProjectRole;
  createdAt: Date;
}

async function getProjectMembersUncached(
  projectId: string,
): Promise<ProjectMemberRow[]> {
  const rows = await dbHttp
    .select({
      userId: projectMemberships.userId,
      name: users.name,
      email: users.email,
      image: users.image,
      role: projectMemberships.role,
      createdAt: projectMemberships.createdAt,
    })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .where(eq(projectMemberships.projectId, projectId))
    .orderBy(desc(projectMemberships.createdAt));
  return rows;
}

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMemberRow[]> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.dashboardProject(projectId));
  cacheTag(cacheTags.project(projectId));
  return await getProjectMembersUncached(projectId);
}

// Re-export so callers don't have to dual-import.
export { or };
