import "server-only";
import { dbHttp } from "@/db";
import {
  projects,
  users,
  payouts,
  snapshots,
  contributors,
  auditLogs,
  platformConfig,
  payoutRecipients,
  projectMemberships,
  apiKeys,
  type ScoringConfig,
  type PayoutConfig,
} from "@/db/schema";
import {
  and,
  desc,
  eq,
  gte,
  isNull,
  like,
  or,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import { applyDbRlsContext } from "@/lib/db-rls";
import { cacheLife, cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache";
import { PayoutConfigSchema, ScoringConfigSchema } from "@repo/shared";
import { z } from "zod";

/**
 * Admin-only query helpers. All callers must `requirePermission('admin.access')`
 * (or stricter) before invoking. These helpers do not enforce permissions —
 * authorization happens one layer up.
 */

const ProjectStatusSchema = z.enum([
  "draft",
  "launch_configured",
  "live",
  "paused",
  "killed",
  "simulated_live",
]);
const ProjectStatusFilterSchema = z
  .union([ProjectStatusSchema, z.literal("all")])
  .optional();
const PayoutStatusSchema = z.enum([
  "pending",
  "claiming",
  "distributing",
  "completed",
  "failed",
  "cancelled",
  "simulated",
]);
const PayoutStatusFilterSchema = z
  .union([PayoutStatusSchema, z.literal("all")])
  .optional();
const AuditFilterSchema = z.object({
  actionPrefix: z.string().min(1).max(100).optional(),
  actionPrefixes: z.array(z.string().min(1).max(100)).max(20).optional(),
  actorUserId: z.string().min(1).max(128).optional(),
  targetType: z.string().min(1).max(80).optional(),
  targetId: z.string().min(1).max(160).optional(),
  sinceHours: z.number().int().min(1).max(24 * 30).optional(),
  sinceMs: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
const PlatformConfigKeySchema = z.string().min(1).max(200);
const IdListSchema = z.array(z.string().min(1).max(128)).max(500);

function normalizeProjectStatusFilter(filter?: {
  status?: string;
}): { status?: z.infer<typeof ProjectStatusFilterSchema> } {
  return { status: ProjectStatusFilterSchema.parse(filter?.status) };
}

function normalizePayoutStatusFilter(filter?: {
  status?: string;
}): { status?: z.infer<typeof PayoutStatusFilterSchema> } {
  return { status: PayoutStatusFilterSchema.parse(filter?.status) };
}

export interface OpsKpis {
  activeProjects: number;
  frozenAwaitingPayout: number;
  failedPayouts: number;
  hotWalletSol: number | null;
  pendingEscrowSol: number;
}

async function getOpsKpisUncached(
  hotWalletLamports: number | null,
): Promise<OpsKpis> {
  const [activeRows, frozenRows, failedRows, escrowRows] = await Promise.all([
    dbHttp
      .select({ c: count() })
      .from(projects)
      .where(eq(projects.status, "live")),
    dbHttp
      .select({ c: count() })
      .from(snapshots)
      .where(eq(snapshots.status, "frozen")),
    dbHttp
      .select({ c: count() })
      .from(payouts)
      .where(eq(payouts.status, "failed")),
    // Bags-native: no off-chain escrow surface, always zero.
    Promise.resolve([{ total: "0" }] as const),
  ]);

  const escrowLamports = BigInt(escrowRows[0]?.total ?? "0");
  const escrowSol = Number(escrowLamports) / 1_000_000_000;
  const hotWalletSol =
    hotWalletLamports == null ? null : hotWalletLamports / 1_000_000_000;

  return {
    activeProjects: activeRows[0]?.c ?? 0,
    frozenAwaitingPayout: frozenRows[0]?.c ?? 0,
    failedPayouts: failedRows[0]?.c ?? 0,
    hotWalletSol,
    pendingEscrowSol: escrowSol,
  };
}

export async function getOpsKpis(
  hotWalletLamports: number | null,
): Promise<OpsKpis> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getOpsKpisUncached(hotWalletLamports);
}

export interface HeartbeatRow {
  key: string;
  workflow: string;
  lastBeatAt: Date | null;
  ageSec: number | null;
  status: "green" | "yellow" | "red";
}

const HEARTBEAT_GREEN_SEC = 120;
const HEARTBEAT_YELLOW_SEC = 600;

/**
 * Hard cap on every unbounded admin list query. Cursor-based pagination via
 * lib/pagination.ts is the long-term answer; this cap is the floor that
 * prevents a single Drizzle call from materialising the entire `projects`
 * or `users` table when those grow.
 */
const ADMIN_LIST_HARD_CAP = 500;

async function getHeartbeatsUncached(): Promise<HeartbeatRow[]> {
  const rows = await dbHttp
    .select({ key: platformConfig.key, value: platformConfig.value })
    .from(platformConfig)
    .where(like(platformConfig.key, "heartbeat.%"));

  const now = Date.now();
  return rows
    .map<HeartbeatRow>((row) => {
      const v = row.value as { lastBeatAt?: string };
      const lastBeatAt = v.lastBeatAt ? new Date(v.lastBeatAt) : null;
      const ageSec = lastBeatAt
        ? Math.max(0, Math.floor((now - lastBeatAt.getTime()) / 1000))
        : null;
      let status: HeartbeatRow["status"] = "red";
      if (ageSec != null) {
        if (ageSec < HEARTBEAT_GREEN_SEC) status = "green";
        else if (ageSec < HEARTBEAT_YELLOW_SEC) status = "yellow";
      }
      return {
        key: row.key,
        workflow: row.key.replace(/^heartbeat\./, ""),
        lastBeatAt,
        ageSec,
        status,
      };
    })
    .sort((a, b) => a.workflow.localeCompare(b.workflow));
}

export async function getHeartbeats(): Promise<HeartbeatRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.platformConfig);
  return await getHeartbeatsUncached();
}

export interface AdminFailedPayoutRow {
  id: string;
  projectId: string;
  projectSlug: string;
  totalLamports: bigint;
  attemptCount: number;
  lastError: string | null;
  scheduledAt: Date;
}

async function getRecentFailedPayoutsUncached(
  limit = 10,
): Promise<AdminFailedPayoutRow[]> {
  const rows = await dbHttp
    .select({
      id: payouts.id,
      projectId: payouts.projectId,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      totalAmountLamports: payouts.totalAmountLamports,
      attemptCount: payouts.attemptCount,
      lastError: payouts.lastError,
      scheduledAt: payouts.scheduledAt,
    })
    .from(payouts)
    .leftJoin(projects, eq(payouts.projectId, projects.id))
    .where(eq(payouts.status, "failed"))
    .orderBy(desc(payouts.scheduledAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectSlug: `${r.ghOwner ?? "?"}/${r.ghRepo ?? "?"}`,
    totalLamports: BigInt(r.totalAmountLamports ?? 0),
    attemptCount: r.attemptCount,
    lastError: r.lastError,
    scheduledAt: r.scheduledAt,
  }));
}

export async function getRecentFailedPayouts(
  limit = 10,
): Promise<AdminFailedPayoutRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getRecentFailedPayoutsUncached(
    z.number().int().min(1).max(100).catch(10).parse(limit),
  );
}

export interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AuditFilter {
  actionPrefix?: string;
  actionPrefixes?: string[];
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  sinceHours?: number;
  sinceMs?: number;
  limit?: number;
}

async function getAuditLogsUncached(
  filter: AuditFilter = {},
): Promise<AuditRow[]> {
  const safeFilter = AuditFilterSchema.parse(filter);
  const sinceMs =
    safeFilter.sinceMs ??
    Date.now() - (safeFilter.sinceHours ?? 24) * 60 * 60 * 1000;
  const since = new Date(sinceMs);
  const limit = safeFilter.limit ?? 100;

  const conds = [gte(auditLogs.createdAt, since)];
  const actionPrefixes =
    safeFilter.actionPrefixes ??
    (safeFilter.actionPrefix ? [safeFilter.actionPrefix] : []);
  if (actionPrefixes.length === 1) {
    conds.push(like(auditLogs.action, `${actionPrefixes[0]}%`));
  } else if (actionPrefixes.length > 1) {
    const prefixCond = or(
      ...actionPrefixes.map((prefix) => like(auditLogs.action, `${prefix}%`)),
    );
    if (prefixCond) conds.push(prefixCond);
  }
  if (safeFilter.actorUserId) {
    conds.push(eq(auditLogs.actorUserId, safeFilter.actorUserId));
  }
  if (safeFilter.targetType) {
    conds.push(eq(auditLogs.targetType, safeFilter.targetType));
  }
  if (safeFilter.targetId) {
    conds.push(eq(auditLogs.targetId, safeFilter.targetId));
  }

  const rows = await dbHttp
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      actorAvatar: users.image,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(and(...conds))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actorUserId,
    actorName: r.actorName,
    actorAvatar: r.actorAvatar,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}

export async function getAuditLogs(
  filter: AuditFilter = {},
): Promise<AuditRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.adminAudit);
  return await getAuditLogsUncached(AuditFilterSchema.parse(filter));
}

export interface AdminProjectRow {
  id: string;
  slug: string;
  name: string;
  ownerName: string | null;
  ownerUsername: string | null;
  status:
    | "draft"
    | "launch_configured"
    | "live"
    | "paused"
    | "killed"
    | "simulated_live"
    | "tracked";
  contributorsCount: number;
  imageUrl: string | null;
  tokenMint: string | null;
  createdAt: Date;
}

async function getAllProjectsUncached(filter?: {
  status?: string;
}): Promise<AdminProjectRow[]> {
  const safeFilter = normalizeProjectStatusFilter(filter);
  const conds = [];
  if (safeFilter.status && safeFilter.status !== "all") {
    conds.push(eq(projects.status, safeFilter.status));
  }

  const baseQuery = dbHttp
    .select({
      id: projects.id,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      name: projects.name,
      ownerName: users.name,
      ownerUsername: users.githubUsername,
      status: projects.status,
      imageUrl: projects.imageUrl,
      tokenMint: projects.tokenMint,
      createdAt: projects.createdAt,
      contributorsCount: sql<number>`(SELECT COUNT(*)::int FROM ${contributors} WHERE ${contributors.projectId} = ${projects.id})`,
    })
    .from(projects)
    .leftJoin(users, eq(projects.ownerUserId, users.id));

  // Hard cap so a runaway projects table cannot blow out the admin page
  // memory footprint. Cursor pagination ships in lib/pagination.ts and is
  // adopted incrementally; until then the admin UI sees the most recent
  // ADMIN_LIST_HARD_CAP rows.
  const rows = conds.length
    ? await baseQuery
        .where(and(...conds))
        .orderBy(desc(projects.createdAt))
        .limit(ADMIN_LIST_HARD_CAP)
    : await baseQuery
        .orderBy(desc(projects.createdAt))
        .limit(ADMIN_LIST_HARD_CAP);

  return rows.map((r) => ({
    id: r.id,
    slug: `${r.ghOwner}/${r.ghRepo}`,
    name: r.name,
    ownerName: r.ownerName,
    ownerUsername: r.ownerUsername,
    status: r.status,
    contributorsCount: r.contributorsCount,
    imageUrl: r.imageUrl,
    tokenMint: r.tokenMint,
    createdAt: r.createdAt,
  }));
}

export async function getAllProjects(filter?: {
  status?: string;
}): Promise<AdminProjectRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getAllProjectsUncached(normalizeProjectStatusFilter(filter));
}

export interface PartnerFeeShareSummary {
  totalProjects: number;
  launchedProjects: number;
  liveLaunchedProjects: number;
  simulatedProjects: number;
  feeShareConfiguredProjects: number;
  missingPoolClaimerProjects: number;
  avgPlatformFeeBps: number;
  minPlatformFeeBps: number;
  maxPlatformFeeBps: number;
  activeApiKeys: number;
  apiKeysUsedLast24h: number;
  lastApiKeyUsedAt: Date | null;
  latestLaunchUpdatedAt: Date | null;
}

async function getPartnerFeeShareSummaryUncached(): Promise<PartnerFeeShareSummary> {
  const [projectRow] = await dbHttp
    .select({
      totalProjects: count(),
      launchedProjects: sql<number>`COUNT(*) FILTER (WHERE ${projects.tokenMint} IS NOT NULL)::int`,
      liveLaunchedProjects: sql<number>`COUNT(*) FILTER (WHERE ${projects.status} = 'live' AND ${projects.tokenMint} IS NOT NULL)::int`,
      simulatedProjects: sql<number>`COUNT(*) FILTER (WHERE ${projects.status} = 'simulated_live')::int`,
      feeShareConfiguredProjects: sql<number>`COUNT(*) FILTER (WHERE ${projects.bagsConfigKey} IS NOT NULL)::int`,
      missingPoolClaimerProjects: sql<number>`COUNT(*) FILTER (WHERE ${projects.bagsConfigKey} IS NOT NULL AND ${projects.bagsPoolClaimerWallet} IS NULL)::int`,
      avgPlatformFeeBps: sql<string>`COALESCE(ROUND(AVG(${projects.platformFeeBps})), 0)::text`,
      minPlatformFeeBps: sql<number>`COALESCE(MIN(${projects.platformFeeBps}), 0)::int`,
      maxPlatformFeeBps: sql<number>`COALESCE(MAX(${projects.platformFeeBps}), 0)::int`,
      latestLaunchUpdatedAt: sql<Date | null>`MAX(${projects.updatedAt}) FILTER (WHERE ${projects.bagsConfigKey} IS NOT NULL)`,
    })
    .from(projects);

  const [apiKeyRow] = await dbHttp
    .select({
      activeApiKeys: count(),
      apiKeysUsedLast24h: sql<number>`COUNT(*) FILTER (WHERE ${apiKeys.lastUsedAt} >= NOW() - INTERVAL '24 hours')::int`,
      lastApiKeyUsedAt: sql<Date | null>`MAX(${apiKeys.lastUsedAt})`,
    })
    .from(apiKeys)
    .where(isNull(apiKeys.revokedAt));

  return {
    totalProjects: Number(projectRow?.totalProjects ?? 0),
    launchedProjects: Number(projectRow?.launchedProjects ?? 0),
    liveLaunchedProjects: Number(projectRow?.liveLaunchedProjects ?? 0),
    simulatedProjects: Number(projectRow?.simulatedProjects ?? 0),
    feeShareConfiguredProjects: Number(
      projectRow?.feeShareConfiguredProjects ?? 0,
    ),
    missingPoolClaimerProjects: Number(
      projectRow?.missingPoolClaimerProjects ?? 0,
    ),
    avgPlatformFeeBps: Number(projectRow?.avgPlatformFeeBps ?? 0),
    minPlatformFeeBps: Number(projectRow?.minPlatformFeeBps ?? 0),
    maxPlatformFeeBps: Number(projectRow?.maxPlatformFeeBps ?? 0),
    activeApiKeys: Number(apiKeyRow?.activeApiKeys ?? 0),
    apiKeysUsedLast24h: Number(apiKeyRow?.apiKeysUsedLast24h ?? 0),
    lastApiKeyUsedAt: apiKeyRow?.lastApiKeyUsedAt ?? null,
    latestLaunchUpdatedAt: projectRow?.latestLaunchUpdatedAt ?? null,
  };
}

export async function getPartnerFeeShareSummary(): Promise<PartnerFeeShareSummary> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getPartnerFeeShareSummaryUncached();
}

async function getProjectAdminDetailUncached(projectId: string): Promise<{
  project: typeof projects.$inferSelect;
  ownerName: string | null;
  ownerUsername: string | null;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
  contributorsCount: number;
  activeApiKeys: number;
  lastApiKeyUsedAt: Date | null;
} | null> {
  const [row] = await dbHttp
    .select({
      project: projects,
      ownerName: users.name,
      ownerUsername: users.githubUsername,
    })
    .from(projects)
    .leftJoin(users, eq(projects.ownerUserId, users.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!row) return null;

  const [contributorsRow, apiKeyRow] = await Promise.all([
    dbHttp
      .select({ c: count() })
      .from(contributors)
      .where(eq(contributors.projectId, projectId)),
    dbHttp
      .select({
        c: count(),
        lastUsedAt: sql<Date | null>`MAX(${apiKeys.lastUsedAt})`,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt))),
  ]);

  return {
    project: {
      ...row.project,
      scoringConfig: ScoringConfigSchema.parse(row.project.scoringConfig),
      payoutConfig: PayoutConfigSchema.parse(row.project.payoutConfig),
    },
    ownerName: row.ownerName,
    ownerUsername: row.ownerUsername,
    scoringConfig: ScoringConfigSchema.parse(row.project.scoringConfig),
    payoutConfig: PayoutConfigSchema.parse(row.project.payoutConfig),
    contributorsCount: contributorsRow[0]?.c ?? 0,
    activeApiKeys: apiKeyRow[0]?.c ?? 0,
    lastApiKeyUsedAt: apiKeyRow[0]?.lastUsedAt ?? null,
  };
}

export async function getProjectAdminDetail(projectId: string): Promise<{
  project: typeof projects.$inferSelect;
  ownerName: string | null;
  ownerUsername: string | null;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
  contributorsCount: number;
  activeApiKeys: number;
  lastApiKeyUsedAt: Date | null;
} | null> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.dashboardProject(projectId));
  return await getProjectAdminDetailUncached(projectId);
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  githubUsername: string | null;
  image: string | null;
  role: "user" | "moderator" | "admin" | "super_admin";
  mfaEnabled: boolean;
  createdAt: Date;
}

async function getAllUsersUncached(): Promise<AdminUserRow[]> {
  const rows = await dbHttp
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      githubUsername: users.githubUsername,
      image: users.image,
      role: users.role,
      mfaSecretEnc: users.mfaSecretEnc,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(500);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    githubUsername: r.githubUsername,
    image: r.image,
    role: r.role,
    mfaEnabled: Boolean(r.mfaSecretEnc),
    createdAt: r.createdAt,
  }));
}

export async function getAllUsers(): Promise<AdminUserRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.adminUsers);
  return await getAllUsersUncached();
}

export interface AdminPayoutRow {
  id: string;
  projectId: string;
  projectSlug: string;
  totalLamports: bigint;
  recipientCount: number;
  status:
    | "pending"
    | "claiming"
    | "distributing"
    | "completed"
    | "failed"
    | "cancelled"
    | "simulated";
  attemptCount: number;
  lastError: string | null;
  scheduledAt: Date;
  snapshotId: string;
}

async function getAllPayoutsUncached(filter?: {
  status?: string;
}): Promise<AdminPayoutRow[]> {
  const safeFilter = normalizePayoutStatusFilter(filter);
  const conds = [];
  if (safeFilter.status && safeFilter.status !== "all") {
    conds.push(eq(payouts.status, safeFilter.status));
  }

  const baseQuery = dbHttp
    .select({
      id: payouts.id,
      projectId: payouts.projectId,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      totalAmountLamports: payouts.totalAmountLamports,
      status: payouts.status,
      attemptCount: payouts.attemptCount,
      lastError: payouts.lastError,
      scheduledAt: payouts.scheduledAt,
      snapshotId: payouts.snapshotId,
      recipientCount: sql<number>`(SELECT COUNT(*)::int FROM ${payoutRecipients} WHERE ${payoutRecipients.payoutId} = ${payouts.id})`,
    })
    .from(payouts)
    .leftJoin(projects, eq(payouts.projectId, projects.id));

  const rows = conds.length
    ? await baseQuery
        .where(and(...conds))
        .orderBy(desc(payouts.scheduledAt))
        .limit(500)
    : await baseQuery.orderBy(desc(payouts.scheduledAt)).limit(500);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectSlug: `${r.ghOwner ?? "?"}/${r.ghRepo ?? "?"}`,
    totalLamports: BigInt(r.totalAmountLamports ?? 0),
    recipientCount: r.recipientCount,
    status: r.status,
    attemptCount: r.attemptCount,
    lastError: r.lastError,
    scheduledAt: r.scheduledAt,
    snapshotId: r.snapshotId,
  }));
}

export async function getAllPayouts(filter?: {
  status?: string;
}): Promise<AdminPayoutRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getAllPayoutsUncached(normalizePayoutStatusFilter(filter));
}

export interface AdminSnapshotRow {
  id: string;
  projectId: string;
  projectSlug: string;
  takenAt: Date;
  status: "pending" | "frozen" | "paid" | "failed";
  totalFeesLamports: bigint;
  recipientCount: number;
  merkleRoot: string;
  forced: boolean;
  forcedBy: string | null;
}

async function getAllSnapshotsUncached(): Promise<AdminSnapshotRow[]> {
  const rows = await dbHttp
    .select({
      id: snapshots.id,
      projectId: snapshots.projectId,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      takenAt: snapshots.takenAt,
      status: snapshots.status,
      totalFeesLamports: snapshots.totalFeesLamports,
      merkleRoot: snapshots.merkleRoot,
      forced: snapshots.forced,
      forcedBy: snapshots.forcedBy,
      leaderboard: snapshots.leaderboard,
    })
    .from(snapshots)
    .leftJoin(projects, eq(snapshots.projectId, projects.id))
    .orderBy(desc(snapshots.takenAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectSlug: `${r.ghOwner ?? "?"}/${r.ghRepo ?? "?"}`,
    takenAt: r.takenAt,
    status: r.status,
    totalFeesLamports: BigInt(r.totalFeesLamports ?? 0),
    recipientCount: Array.isArray(r.leaderboard) ? r.leaderboard.length : 0,
    merkleRoot: r.merkleRoot,
    forced: r.forced === "true",
    forcedBy: r.forcedBy,
  }));
}

export async function getAllSnapshots(): Promise<AdminSnapshotRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getAllSnapshotsUncached();
}

async function getSnapshotDetailUncached(snapshotId: string) {
  const [row] = await dbHttp
    .select({
      snapshot: snapshots,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
    })
    .from(snapshots)
    .leftJoin(projects, eq(snapshots.projectId, projects.id))
    .where(eq(snapshots.id, snapshotId))
    .limit(1);
  if (!row) return null;
  return {
    ...row.snapshot,
    slug: `${row.ghOwner ?? "?"}/${row.ghRepo ?? "?"}`,
  };
}

export async function getSnapshotDetail(snapshotId: string) {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getSnapshotDetailUncached(
    z.string().min(1).max(128).parse(snapshotId),
  );
}

export async function getPlatformConfigValue<T = Record<string, unknown>>(
  key: string,
): Promise<T | null> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.platformConfig);
  return await getPlatformConfigValueUncached<T>(
    PlatformConfigKeySchema.parse(key),
  );
}

async function getPlatformConfigValueUncached<T = Record<string, unknown>>(
  key: string,
): Promise<T | null> {
  const [row] = await dbHttp
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, key))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

async function getTableRowCountsUncached(): Promise<
  Array<{ table: string; rows: number }>
> {
  const tableNames = [
    "users",
    "sessions",
    "accounts",
    "verifications",
    "wallets",
    "projects",
    "project_memberships",
    "contributors",
    "contributor_claims",
    "snapshots",
    "payouts",
    "payout_recipients",
    "escrow_holdings",
    "audit_logs",
    "webhook_events",
    "gh_indexer_state",
    "platform_config",
  ];

  // Cheap reltuples-based estimate. Falls back to 0 on error.
  try {
    const result = await dbHttp.execute<{
      tableName: string;
      rowEstimate: string | number;
    }>(sql`
      SELECT allowed.name AS "tableName",
             COALESCE(pg_class.reltuples::bigint, 0) AS "rowEstimate"
      FROM unnest(${tableNames}::text[]) WITH ORDINALITY AS allowed(name, ord)
      LEFT JOIN pg_class
        ON pg_class.relname = allowed.name
       AND pg_class.relkind = 'r'
      ORDER BY allowed.ord
    `);

    return result.rows.map((row) => ({
      table: row.tableName,
      rows:
        typeof row.rowEstimate === "string"
          ? Number(row.rowEstimate)
          : row.rowEstimate,
    }));
  } catch {
    return tableNames.map((table) => ({ table, rows: 0 }));
  }
}

export async function getTableRowCounts(): Promise<
  Array<{ table: string; rows: number }>
> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  return await getTableRowCountsUncached();
}

/**
 * Promote a `simulated_live` project to a clean `draft` state ready for a
 * real on-chain launch. Drops every payouts row in `simulated` status for
 * the project (the cascade FK on payout_recipients drops their rows too).
 *
 * Caller MUST gate with `requirePermission('admin.access')`.
 */
export async function promoteProjectFromStub(projectId: string): Promise<{
  projectId: string;
  slug: string;
  simulatedPayoutsDeleted: number;
  ready: true;
}> {
  const dbp = (await import("@/db")).dbPool();
  return await dbp.transaction(async (tx) => {
    await applyDbRlsContext(tx, {
      mode: "service",
      reason: "admin:promoteProjectFromStub",
    });
    const [proj] = await tx
      .select({
        id: projects.id,
        ghOwner: projects.ghOwner,
        ghRepo: projects.ghRepo,
        status: projects.status,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!proj) {
      throw new Error(`promoteProjectFromStub: project ${projectId} not found`);
    }

    // Delete simulated payouts; cascade FK clears payout_recipients.
    const deleted = await tx
      .delete(payouts)
      .where(
        and(eq(payouts.projectId, projectId), eq(payouts.status, "simulated")),
      )
      .returning({ id: payouts.id });

    // Reset project to draft + clear stub artifacts.
    await tx
      .update(projects)
      .set({
        tokenMint: null,
        bagsLaunchId: null,
        bagsConfigKey: null,
        bagsLaunchSignature: null,
        bagsLaunchWallet: null,
        bagsPoolClaimerWallet: null,
        bagsTokenMetadata: null,
        bagsInitialBuyLamports: 0,
        status: "draft",
        simulatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return {
      projectId,
      slug: `${proj.ghOwner}/${proj.ghRepo}`,
      simulatedPayoutsDeleted: deleted.length,
      ready: true as const,
    };
  });
}

async function getUsersByIdsUncached(ids: string[]): Promise<AdminUserRow[]> {
  const safeIds = IdListSchema.parse(ids);
  if (safeIds.length === 0) return [];
  const rows = await dbHttp
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      githubUsername: users.githubUsername,
      image: users.image,
      role: users.role,
      mfaSecretEnc: users.mfaSecretEnc,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.id, safeIds));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    githubUsername: r.githubUsername,
    image: r.image,
    role: r.role,
    mfaEnabled: Boolean(r.mfaSecretEnc),
    createdAt: r.createdAt,
  }));
}

export async function getUsersByIds(ids: string[]): Promise<AdminUserRow[]> {
  const safeIds = IdListSchema.parse(ids);
  if (safeIds.length === 0) return [];
  return getUsersByIdsCached([...safeIds].sort());
}

async function getUsersByIdsCached(
  sortedIds: string[],
): Promise<AdminUserRow[]> {
  "use cache";
  cacheLife("admin");
  cacheTag(cacheTags.admin);
  cacheTag(cacheTags.adminUsers);
  return await getUsersByIdsUncached(sortedIds);
}

/**
 * Hand a project's ownership to another GitShipt user.
 *
 *  - Updates `projects.ownerUserId` to `newOwnerUserId`.
 *  - Upserts the new owner into `project_memberships` with role
 *    `project_owner`.
 *  - Demotes the prior owner (the row in `project_memberships`, if any) to
 *    `project_moderator` so they keep delegated access without elevated
 *    rights.
 *
 * Runs inside a `dbPool` transaction. Caller MUST re-validate the session
 * and `requirePermission('project.transfer', ...)` BEFORE invoking — and
 * should wrap with `destructiveAction()` for full reason+confirm+MFA gating.
 */
export async function transferProjectOwnership(
  projectId: string,
  newOwnerUserId: string,
  requestingUserId: string,
): Promise<{
  newOwner: { id: string; name: string; email: string };
  previousOwnerUserId: string;
}> {
  const dbp = (await import("@/db")).dbPool();
  return await dbp.transaction(async (tx) => {
    await applyDbRlsContext(tx, {
      mode: "service",
      reason: "admin:transferProjectOwnership",
    });
    const [proj] = await tx
      .select({ id: projects.id, ownerUserId: projects.ownerUserId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!proj) {
      throw new Error(
        `transferProjectOwnership: project ${projectId} not found`,
      );
    }
    if (proj.ownerUserId === newOwnerUserId) {
      throw new Error(
        "transferProjectOwnership: recipient is already the owner",
      );
    }

    const [recipient] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, newOwnerUserId))
      .limit(1);
    if (!recipient) {
      throw new Error(
        `transferProjectOwnership: recipient user ${newOwnerUserId} not found`,
      );
    }

    const previousOwnerUserId = proj.ownerUserId;

    await tx
      .update(projects)
      .set({ ownerUserId: newOwnerUserId, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    const [existingNew] = await tx
      .select({ id: projectMemberships.id })
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.userId, newOwnerUserId),
          eq(projectMemberships.projectId, projectId),
        ),
      )
      .limit(1);
    if (existingNew) {
      await tx
        .update(projectMemberships)
        .set({ role: "project_owner" })
        .where(eq(projectMemberships.id, existingNew.id));
    } else {
      await tx.insert(projectMemberships).values({
        userId: newOwnerUserId,
        projectId,
        role: "project_owner",
      });
    }

    const [existingPrev] = await tx
      .select({ id: projectMemberships.id })
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.userId, previousOwnerUserId),
          eq(projectMemberships.projectId, projectId),
        ),
      )
      .limit(1);
    if (existingPrev) {
      await tx
        .update(projectMemberships)
        .set({ role: "project_moderator" })
        .where(eq(projectMemberships.id, existingPrev.id));
    } else {
      await tx.insert(projectMemberships).values({
        userId: previousOwnerUserId,
        projectId,
        role: "project_moderator",
      });
    }

    void requestingUserId;

    return {
      newOwner: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
      },
      previousOwnerUserId,
    };
  });
}
