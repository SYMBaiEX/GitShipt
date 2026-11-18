import "server-only";
import { dbHttp } from "@/db";
import {
  projects,
  contributors,
  contributorClaims,
  payouts,
  payoutRecipients,
  type ScoringConfig,
  type PayoutConfig,
} from "@/db/schema";
import { eq, and, desc, sql, asc, isNotNull } from "drizzle-orm";
import { bags } from "@/lib/bags/client";
import { fetchGitHubJsonWithEtag } from "@/lib/github/http-cache";
import { hasCredentials } from "@/lib/env";
import { cacheLife, cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache";
import {
  GitHubRepoMetaSchema,
  type GitHubRepoMeta,
} from "@repo/shared";
import { z } from "zod";

export interface ProjectHeader {
  id: string;
  slug: string; // `${ghOwner}/${ghRepo}`
  ghOwner: string;
  ghRepo: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  tokenMint: string | null;
  bagsLaunchId: string | null;
  status: "draft" | "launch_configured" | "live" | "paused" | "killed" | "simulated_live" | "tracked";
  platformFeeBps: number;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
  contributorsCount: number;
  createdAt: Date;
  /** GitHub repo metadata (cached 5min via Redis). Null when fetch fails. */
  language: string | null;
  stars: number;
  forks: number;
}

export interface LeaderboardRow {
  rank: number;
  contributorId: string;
  ghUserId: string;
  ghUsername: string;
  avatarUrl: string | null;
  score: number;
  inputs: {
    mergedPRs: number;
    commits: number;
    reviews: number;
    issues: number;
    netLines: number;
  };
  weight: number; // 0..1, from payoutConfig.tierWeights
  weightPercent: number; // 0..100, for display
  isWalletLinked: boolean;
}

export interface RecentPayoutRow {
  id: string;
  executedAt: Date;
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
  claimSignature: string | null;
}

export interface PoolOverview {
  dailyFeeLamports: bigint;
  dailyFeeUsd: number | null;
  lifetimeLamports: bigint;
  lifetimeUsd: number | null;
  feeShareBps: number; // for the "Fee Share: 20%" pill
  sparkline: { date: string; lamports: bigint }[]; // 30 days
  bagsUrl: string | null;
  isStub: boolean; // true when Bags creds absent
}

export interface ProjectPageData {
  header: ProjectHeader;
  leaderboard: LeaderboardRow[];
  pool: PoolOverview;
  recentPayouts: RecentPayoutRow[];
  nextPayoutAt: Date;
}

function nextPayoutDate(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(0, 30, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

const GitHubRepoApiMetaSchema = z.object({
  language: z.string().nullable().optional(),
  stargazers_count: z.number().int().min(0).optional(),
  forks_count: z.number().int().min(0).optional(),
});

/**
 * Reuse GitHub's ETag after the five-minute display cache expires.
 */
async function fetchGitHubRepoMeta(
  ghOwner: string,
  ghRepo: string,
): Promise<GitHubRepoMeta> {
  try {
    const data = await fetchGitHubJsonWithEtag(
      `public-repo:${ghOwner.toLowerCase()}/${ghRepo.toLowerCase()}`,
      `https://api.github.com/repos/${encodeURIComponent(ghOwner)}/${encodeURIComponent(ghRepo)}`,
      GitHubRepoApiMetaSchema,
      { ttlSeconds: 300, timeoutMs: 1_500 },
    );
    return GitHubRepoMetaSchema.parse({
      language: data.language ?? null,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
    });
  } catch {
    return { language: null, stars: 0, forks: 0 };
  }
}

async function getProjectRecordBySlug(ghOwner: string, ghRepo: string) {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.projectSlug(`${ghOwner}/${ghRepo}`));
  // CI builds (no DATABASE_URL secret) prerender public pages and would
  // otherwise hit the dbHttp Proxy throw. Match the lib/redis.ts +
  // getLandingDataUncached idiom and short-circuit gracefully.
  if (!hasCredentials.db()) return null;
  const [row] = await dbHttp
    .select({
      id: projects.id,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      name: projects.name,
      description: projects.description,
      imageUrl: projects.imageUrl,
      tokenMint: projects.tokenMint,
      bagsLaunchId: projects.bagsLaunchId,
      status: projects.status,
      platformFeeBps: projects.platformFeeBps,
      scoringConfig: projects.scoringConfig,
      payoutConfig: projects.payoutConfig,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.ghOwner, ghOwner), eq(projects.ghRepo, ghRepo)))
    .limit(1);
  return row ?? null;
}

export type ProjectShellIdentity = Pick<ProjectHeader, "id" | "name" | "ghOwner" | "ghRepo">;

export async function getProjectShellIdentity(
  ghOwner: string,
  ghRepo: string,
): Promise<ProjectShellIdentity | null> {
  const row = await getProjectRecordBySlug(ghOwner, ghRepo);
  if (!row) return null;
  return { id: row.id, name: row.name, ghOwner: row.ghOwner, ghRepo: row.ghRepo };
}

async function getProjectBySlugUncached(
  ghOwner: string,
  ghRepo: string,
): Promise<ProjectHeader | null> {
  const row = await getProjectRecordBySlug(ghOwner, ghRepo);
  if (!row) return null;

  const [countRows, ghMeta] = await Promise.all([
    dbHttp
      .select({ count: sql<number>`count(*)::int` })
      .from(contributors)
      .where(eq(contributors.projectId, row.id)),
    fetchGitHubRepoMeta(row.ghOwner, row.ghRepo),
  ]);
  const count = countRows[0]?.count ?? 0;

  return {
    id: row.id,
    slug: `${row.ghOwner}/${row.ghRepo}`,
    ghOwner: row.ghOwner,
    ghRepo: row.ghRepo,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    tokenMint: row.tokenMint,
    bagsLaunchId: row.bagsLaunchId,
    status: row.status,
    platformFeeBps: row.platformFeeBps,
    scoringConfig: row.scoringConfig,
    payoutConfig: row.payoutConfig,
    contributorsCount: count,
    createdAt: row.createdAt,
    language: ghMeta.language,
    stars: ghMeta.stars,
    forks: ghMeta.forks,
  };
}

export async function getProjectBySlug(
  ghOwner: string,
  ghRepo: string,
): Promise<ProjectHeader | null> {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.projectSlug(`${ghOwner}/${ghRepo}`));
  return await getProjectBySlugUncached(ghOwner, ghRepo);
}

async function getProjectLeaderboardUncached(
  projectId: string,
  payoutConfig: PayoutConfig,
): Promise<LeaderboardRow[]> {
  if (!hasCredentials.db()) return [];
  const rows = await dbHttp
    .select({
      contributorId: contributors.id,
      ghUserId: contributors.ghUserId,
      ghUsername: contributors.ghUsername,
      avatarUrl: contributors.avatarUrl,
      score: contributors.score,
      rank: contributors.rank,
      inputs: contributors.inputs,
      walletAddress: contributorClaims.walletAddress,
    })
    .from(contributors)
    .leftJoin(
      contributorClaims,
      eq(contributorClaims.contributorId, contributors.id),
    )
    .where(
      and(
        eq(contributors.projectId, projectId),
        isNotNull(contributors.rank),
        eq(contributors.excluded, "false"),
      ),
    )
    .orderBy(asc(contributors.rank))
    .limit(payoutConfig.topN);

  return rows.map((r, i) => {
    const rank = r.rank ?? i + 1;
    const weight = payoutConfig.tierWeights[rank - 1] ?? 0;
    return {
      rank,
      contributorId: r.contributorId,
      ghUserId: r.ghUserId,
      ghUsername: r.ghUsername,
      avatarUrl: r.avatarUrl,
      score: r.score,
      inputs: r.inputs,
      weight,
      weightPercent: weight * 100,
      isWalletLinked: Boolean(r.walletAddress),
    };
  });
}

export async function getProjectLeaderboard(
  projectId: string,
  payoutConfig: PayoutConfig,
): Promise<LeaderboardRow[]> {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.project(projectId));
  return await getProjectLeaderboardUncached(projectId, payoutConfig);
}

async function getRecentPayoutsUncached(
  projectId: string,
  limit = 5,
): Promise<RecentPayoutRow[]> {
  const rows = await dbHttp
    .select({
      id: payouts.id,
      executedAt: payouts.executedAt,
      totalLamports: payouts.totalAmountLamports,
      status: payouts.status,
      claimSignature: payouts.claimSignature,
      recipientCount: sql<number>`count(${payoutRecipients.id})::int`,
    })
    .from(payouts)
    .leftJoin(payoutRecipients, eq(payoutRecipients.payoutId, payouts.id))
    .where(eq(payouts.projectId, projectId))
    .groupBy(payouts.id)
    .orderBy(desc(payouts.executedAt))
    .limit(limit);

  return rows
    .filter((r) => r.executedAt !== null)
    .map((r) => ({
      id: r.id,
      executedAt: r.executedAt!,
      totalLamports: r.totalLamports,
      recipientCount: r.recipientCount ?? 0,
      status: r.status,
      claimSignature: r.claimSignature,
    }));
}

export async function getRecentPayouts(
  projectId: string,
  limit = 5,
): Promise<RecentPayoutRow[]> {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.projectPayouts(projectId));
  return await getRecentPayoutsUncached(projectId, limit);
}

async function getPoolOverviewUncached(
  header: ProjectHeader,
): Promise<PoolOverview> {
  let lifetimeLamports = 0n;
  let lifetimeUsd: number | null = null;
  let isStub = !bags.hasCredentials();

  if (
    header.tokenMint &&
    (header.status === "live" || header.status === "tracked")
  ) {
    try {
      const lifetime = await bags.getLifetimeFees(header.tokenMint);
      lifetimeLamports = lifetime.totalLifetimeLamports;
      lifetimeUsd = lifetime.totalLifetimeUsd ?? null;
      isStub = isStub || Boolean(lifetime.__stub);
    } catch (e) {
      console.warn("[pool] lifetime fees fetch failed:", e);
    }
  }

  // Daily fee = lifetime / max(1, days since launch). Approximation until
  // Day 3 wires actual per-day claim history into snapshot rows.
  const daysLive = Math.max(
    1,
    Math.floor((Date.now() - header.createdAt.getTime()) / 86_400_000),
  );
  const dailyFeeLamports = lifetimeLamports / BigInt(daysLive);
  const dailyFeeUsd = lifetimeUsd != null ? lifetimeUsd / daysLive : null;

  const sparkline = buildStubSparkline(dailyFeeLamports);

  return {
    dailyFeeLamports,
    dailyFeeUsd,
    lifetimeLamports,
    lifetimeUsd,
    feeShareBps: 10_000 - header.platformFeeBps, // contributor pool BPS
    sparkline,
    bagsUrl:
      header.tokenMint &&
      (header.status === "live" || header.status === "tracked")
        ? bags.bagsTokenUrl(header.tokenMint)
        : null,
    isStub,
  };
}

export async function getPoolOverview(
  header: ProjectHeader,
): Promise<PoolOverview> {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.project(header.id));
  cacheTag(cacheTags.projectPayouts(header.id));
  return await getPoolOverviewUncached(header);
}

function buildStubSparkline(
  currentLamports: bigint,
): { date: string; lamports: bigint }[] {
  const out: { date: string; lamports: bigint }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    // Slight wave for visual interest; deterministic per day.
    const hash = Number((BigInt(d.getUTCDate()) * 7n) % 13n);
    const factor = 70 + hash * 2; // 70..96
    const lamports = (currentLamports * BigInt(factor)) / 100n;
    out.push({ date: d.toISOString().slice(0, 10), lamports });
  }
  return out;
}

async function getProjectPageDataUncached(
  ghOwner: string,
  ghRepo: string,
): Promise<ProjectPageData | null> {
  const header = await getProjectBySlug(ghOwner, ghRepo);
  if (!header) return null;

  const [leaderboard, recentPayouts, pool] = await Promise.all([
    getProjectLeaderboard(header.id, header.payoutConfig),
    getRecentPayouts(header.id),
    getPoolOverview(header),
  ]);

  return {
    header,
    leaderboard,
    pool,
    recentPayouts,
    nextPayoutAt: nextPayoutDate(),
  };
}

export async function getProjectPageData(
  ghOwner: string,
  ghRepo: string,
): Promise<ProjectPageData | null> {
  "use cache";
  cacheLife("live");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.projectSlug(`${ghOwner}/${ghRepo}`));
  return await getProjectPageDataUncached(ghOwner, ghRepo);
}
