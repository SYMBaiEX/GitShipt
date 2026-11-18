import "server-only";
import { dbHttp } from "@/db";
import {
  projects,
  contributors,
  contributorClaims,
  payouts,
  payoutRecipients,
  snapshots,
  type LeaderboardEntry,
} from "@/db/schema";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache";
import { hasCredentials } from "@/lib/env";

/**
 * Discovery queries — back the public browse surfaces (/explore, /u/[username],
 * /r/[org]/[repo]/snapshots). Modeled after `lib/queries/project-page.ts`:
 * single-shot reads via `dbHttp`, plain pure types, and tagged Next data-cache
 * wrappers at the exported boundary.
 *
 * BigInt is preserved across the query/page boundary; consumers pass it
 * through `formatSol()` for display.
 */

// ---------------------------------------------------------------------------
// Explore — getAllPublicProjects
// ---------------------------------------------------------------------------

export interface PublicProjectRow {
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
    | "simulated_live"
    | "tracked";
  contributorsCount: number;
  /** Lifetime SOL paid out across all completed payouts. */
  lifetimeFeesLamports: bigint;
  /** Lifetime / max(1, days since launch). Crude "daily" approximation,
   *  consistent with the project page's PoolOverview math. */
  dailyFeeLamports: bigint;
  tokenMint: string | null;
  createdAt: Date;
}

export interface ExploreFilters {
  status?: "all" | "live" | "paused" | "tracked";
  sort?: "trending" | "lifetime" | "contributors" | "newest";
  search?: string;
  /** Max rows returned. Defaults to 60. */
  limit?: number;
}

/**
 * List public projects with status/sort/search filters. "Killed" is excluded
 * by default — those are off the leaderboard for everyone except admins.
 *
 * Sort options:
 *   - trending      : last-24h payouts SOL desc
 *   - lifetime      : all-time payout SOL desc (default fallback)
 *   - contributors  : ranked-contributor count desc
 *   - newest        : project createdAt desc
 *
 * Search matches `gh_owner/gh_repo` slug or `name` (case-insensitive).
 */
async function getAllPublicProjectsUncached(
  filters: ExploreFilters,
): Promise<PublicProjectRow[]> {
  if (!hasCredentials.db()) return [];
  const limit = filters.limit ?? 60;
  const status = filters.status ?? "all";
  const sort = filters.sort ?? "trending";

  // Status filter — never show 'killed', 'draft', or 'launch_configured' on
  // the public explore. A project becomes visible the moment it goes live
  // (or is temp paused).
  //   - 'simulated_live' rolls into the "Live" bucket because those projects
  //     are operationally running on stub fallbacks; ProjectCard surfaces a
  //     "Simulated" badge so visitors can tell them apart.
  //   - 'tracked' is for externally-launched Bags tokens we index but don't
  //     operate; surfaced in the default 'all' view (and via ?status=tracked).
  const statusValues =
    status === "live"
      ? ["live", "simulated_live"]
      : status === "paused"
        ? ["paused"]
        : status === "tracked"
          ? ["tracked"]
          : ["live", "paused", "simulated_live", "tracked"];

  const search = filters.search?.trim();

  const whereParts = [
    inArray(
      projects.status,
      statusValues as ("live" | "paused" | "simulated_live" | "tracked")[],
    ),
  ];
  if (search) {
    // Token mint addresses are case-sensitive base58, so an exact match on
    // tokenMint is the right shape for "search by contract address".
    whereParts.push(
      or(
        ilike(projects.name, `%${search}%`),
        ilike(projects.ghOwner, `%${search}%`),
        ilike(projects.ghRepo, `%${search}%`),
        eq(projects.tokenMint, search),
      )!,
    );
  }

  const lifetimeAgg = sql<bigint>`coalesce(sum(case when ${payouts.status} = 'completed' then ${payouts.totalAmountLamports} else 0 end), 0)::bigint`;
  const trendingAgg = sql<bigint>`coalesce(sum(case when ${payouts.status} = 'completed' and ${payouts.executedAt} > now() - interval '24 hours' then ${payouts.totalAmountLamports} else 0 end), 0)::bigint`;
  const contributorsAgg = sql<number>`(
    select count(*)::int
    from ${contributors}
    where ${contributors.projectId} = ${projects.id}
      and ${contributors.rank} is not null
      and ${contributors.excluded} = 'false'
  )`;

  const orderBy =
    sort === "newest"
      ? desc(projects.createdAt)
      : sort === "contributors"
        ? desc(contributorsAgg)
        : sort === "lifetime"
          ? desc(lifetimeAgg)
          : desc(trendingAgg);

  const rows = await dbHttp
    .select({
      id: projects.id,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      name: projects.name,
      description: projects.description,
      imageUrl: projects.imageUrl,
      status: projects.status,
      tokenMint: projects.tokenMint,
      createdAt: projects.createdAt,
      lifetimeFeesLamports: lifetimeAgg,
      contributorsCount: contributorsAgg,
    })
    .from(projects)
    .leftJoin(payouts, eq(payouts.projectId, projects.id))
    .where(and(...whereParts))
    .groupBy(projects.id)
    .orderBy(orderBy)
    .limit(limit);

  const now = Date.now();
  return rows.map((r) => {
    const lifetime = BigInt(r.lifetimeFeesLamports ?? 0n);
    const daysLive = Math.max(
      1,
      Math.floor((now - r.createdAt.getTime()) / 86_400_000),
    );
    return {
      id: r.id,
      slug: `${r.ghOwner}/${r.ghRepo}`,
      ghOwner: r.ghOwner,
      ghRepo: r.ghRepo,
      name: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      status: r.status,
      tokenMint: r.tokenMint,
      contributorsCount: r.contributorsCount ?? 0,
      lifetimeFeesLamports: lifetime,
      dailyFeeLamports: lifetime / BigInt(daysLive),
      createdAt: r.createdAt,
    };
  });
}

export async function getAllPublicProjects(
  filters: ExploreFilters,
): Promise<PublicProjectRow[]> {
  const normalized: ExploreFilters = {
    status: filters.status ?? "all",
    sort: filters.sort ?? "trending",
    search: filters.search?.trim().slice(0, 160) || undefined,
    limit: filters.limit ?? 60,
  };
  // Free-text inputs are effectively unbounded cache keys. Cache the
  // frequently revisited status/sort views, not individual search terms.
  return normalized.search
    ? getAllPublicProjectsUncached(normalized)
    : getAllPublicProjectsCached(normalized);
}

async function getAllPublicProjectsCached(
  normalized: ExploreFilters,
): Promise<PublicProjectRow[]> {
  "use cache: remote";
  cacheLife("browse");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.explore);
  return await getAllPublicProjectsUncached(normalized);
}

// ---------------------------------------------------------------------------
// Contributor profile — getContributorProfile
// ---------------------------------------------------------------------------

export interface ContributorProfileProjectRow {
  projectId: string;
  slug: string;
  name: string;
  rank: number;
  score: number;
  lifetimeLamports: bigint;
  isWalletLinked: boolean;
}

export interface ContributorProfilePayoutRow {
  id: string;
  projectSlug: string;
  executedAt: Date;
  amountLamports: bigint;
  txSignature: string | null;
}

export interface ContributorProfile {
  ghUsername: string;
  ghUserId: string | null;
  avatarUrl: string;
  totalLifetimeLamports: bigint;
  projectsCount: number;
  totalPRs: number;
  totalCommits: number;
  byProject: ContributorProfileProjectRow[];
  recentPayouts: ContributorProfilePayoutRow[];
}

/**
 * Profile aggregated by GitHub username — a contributor is per-project, but
 * users follow them across the platform. We sum scoring inputs and lifetime
 * earnings across every contributor row that shares this `gh_username`.
 *
 * Returns `null` when no contributor row exists for the username — the caller
 * should `notFound()` on that.
 */
async function getContributorProfileUncached(
  username: string,
): Promise<ContributorProfile | null> {
  const contribRows = await dbHttp
    .select({
      contributorId: contributors.id,
      projectId: contributors.projectId,
      ghUserId: contributors.ghUserId,
      avatarUrl: contributors.avatarUrl,
      score: contributors.score,
      rank: contributors.rank,
      inputs: contributors.inputs,
      slug: sql<string>`${projects.ghOwner} || '/' || ${projects.ghRepo}`,
      name: projects.name,
      walletAddress: contributorClaims.walletAddress,
    })
    .from(contributors)
    .innerJoin(projects, eq(projects.id, contributors.projectId))
    .leftJoin(
      contributorClaims,
      eq(contributorClaims.contributorId, contributors.id),
    )
    .where(eq(contributors.ghUsername, username));

  if (contribRows.length === 0) return null;

  const contributorIds = contribRows.map((r) => r.contributorId);

  // Per-contributor lifetime payout totals — only confirmed sends count.
  const earnedRows = await dbHttp
    .select({
      contributorId: payoutRecipients.contributorId,
      lifetimeLamports: sql<bigint>`coalesce(sum(case when ${payoutRecipients.status} in ('sent','confirmed') then ${payoutRecipients.amountLamports} else 0 end), 0)::bigint`,
    })
    .from(payoutRecipients)
    .where(inArray(payoutRecipients.contributorId, contributorIds))
    .groupBy(payoutRecipients.contributorId);

  const earnedByContributor = new Map<string, bigint>();
  for (const row of earnedRows) {
    earnedByContributor.set(
      row.contributorId,
      BigInt(row.lifetimeLamports ?? 0n),
    );
  }

  // Recent payouts received by this username — last 30, newest first.
  const recentRows = await dbHttp
    .select({
      id: payoutRecipients.id,
      executedAt: payouts.executedAt,
      amountLamports: payoutRecipients.amountLamports,
      txSignature: payoutRecipients.txSignature,
      slug: sql<string>`${projects.ghOwner} || '/' || ${projects.ghRepo}`,
    })
    .from(payoutRecipients)
    .innerJoin(payouts, eq(payouts.id, payoutRecipients.payoutId))
    .innerJoin(projects, eq(projects.id, payouts.projectId))
    .where(
      and(
        inArray(payoutRecipients.contributorId, contributorIds),
        // Only show payouts that actually went out — not pending/failed rows.
        inArray(payoutRecipients.status, ["sent", "confirmed"]),
      ),
    )
    .orderBy(desc(payouts.executedAt))
    .limit(30);

  const byProjectMap = new Map<string, ContributorProfileProjectRow>();
  for (const row of contribRows) {
    const lifetimeLamports = earnedByContributor.get(row.contributorId) ?? 0n;
    const existing = byProjectMap.get(row.projectId);

    if (!existing) {
      byProjectMap.set(row.projectId, {
        projectId: row.projectId,
        slug: row.slug,
        name: row.name,
        rank: row.rank ?? 0,
        score: row.score,
        lifetimeLamports,
        isWalletLinked: Boolean(row.walletAddress),
      });
      continue;
    }

    existing.lifetimeLamports += lifetimeLamports;
    existing.score += row.score;
    existing.isWalletLinked ||= Boolean(row.walletAddress);
    if (row.rank && (existing.rank === 0 || row.rank < existing.rank)) {
      existing.rank = row.rank;
    }
  }

  const byProject: ContributorProfileProjectRow[] = Array.from(
    byProjectMap.values(),
  ).sort((a, b) => {
    if (b.lifetimeLamports !== a.lifetimeLamports) {
      return b.lifetimeLamports > a.lifetimeLamports ? 1 : -1;
    }
    return b.score - a.score;
  });

  const totalLifetime = byProject.reduce(
    (sum, p) => sum + p.lifetimeLamports,
    0n,
  );

  const totalPRs = contribRows.reduce(
    (sum, r) => sum + (r.inputs?.mergedPRs ?? 0),
    0,
  );
  const totalCommits = contribRows.reduce(
    (sum, r) => sum + (r.inputs?.commits ?? 0),
    0,
  );

  // Pick first non-null avatar; GitHub serves a working fallback regardless.
  const firstAvatar = contribRows.find((r) => r.avatarUrl)?.avatarUrl ?? null;
  const avatarUrl = firstAvatar ?? `https://github.com/${username}.png`;
  const ghUserId = contribRows[0]?.ghUserId ?? null;

  return {
    ghUsername: username,
    ghUserId,
    avatarUrl,
    totalLifetimeLamports: totalLifetime,
    projectsCount: byProject.length,
    totalPRs,
    totalCommits,
    byProject,
    recentPayouts: recentRows
      .filter((r) => r.executedAt !== null)
      .map((r) => ({
        id: r.id,
        projectSlug: r.slug,
        executedAt: r.executedAt!,
        amountLamports: BigInt(r.amountLamports),
        txSignature: r.txSignature,
      })),
  };
}

export async function getContributorProfile(
  username: string,
): Promise<ContributorProfile | null> {
  return getContributorProfileCached(username.toLowerCase());
}

async function getContributorProfileCached(
  normalized: string,
): Promise<ContributorProfile | null> {
  "use cache";
  cacheLife("profile");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.contributor(normalized));
  return await getContributorProfileUncached(normalized);
}

// ---------------------------------------------------------------------------
// Snapshots ledger — getProjectSnapshots
// ---------------------------------------------------------------------------

export interface SnapshotLeaderboardPreview {
  rank: number;
  ghUsername: string;
  score: number;
  weight: number;
}

export interface SnapshotRow {
  id: string;
  takenAt: Date;
  formulaVersion: string;
  status: "pending" | "frozen" | "paid" | "failed";
  totalFeesLamports: bigint;
  merkleRoot: string;
  recipientCount: number;
  forced: boolean;
  /** Top-10 leaderboard entries (truncated for display). */
  leaderboard: SnapshotLeaderboardPreview[];
}

/**
 * Project snapshot ledger — newest first, paginated. The leaderboard JSONB
 * is truncated server-side to top-10 so we don't ship hundreds of rows
 * across the boundary unnecessarily; the snapshot row's expand UI shows
 * just that preview.
 */
async function getProjectSnapshotsUncached(
  projectId: string,
  limit = 50,
): Promise<SnapshotRow[]> {
  const rows = await dbHttp
    .select({
      id: snapshots.id,
      takenAt: snapshots.takenAt,
      formulaVersion: snapshots.formulaVersion,
      status: snapshots.status,
      totalFeesLamports: snapshots.totalFeesLamports,
      merkleRoot: snapshots.merkleRoot,
      forced: snapshots.forced,
      leaderboard: snapshots.leaderboard,
      recipientCount: sql<number>`(
        select count(*)::int
        from "payout_recipients" as "pr"
        inner join "payouts" as "p" on "p"."id" = "pr"."payout_id"
        where "p"."snapshot_id" = "snapshots"."id"
      )`,
    })
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.takenAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    takenAt: r.takenAt,
    formulaVersion: r.formulaVersion,
    status: r.status,
    totalFeesLamports: BigInt(r.totalFeesLamports),
    merkleRoot: r.merkleRoot,
    recipientCount: r.recipientCount ?? 0,
    forced: r.forced === "true",
    leaderboard: previewLeaderboard(r.leaderboard ?? []),
  }));
}

export async function getProjectSnapshots(
  projectId: string,
  limit = 50,
): Promise<SnapshotRow[]> {
  "use cache";
  cacheLife("browse");
  cacheTag(cacheTags.public);
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.projectSnapshots(projectId));
  return await getProjectSnapshotsUncached(projectId, limit);
}

function previewLeaderboard(
  entries: LeaderboardEntry[],
): SnapshotLeaderboardPreview[] {
  return entries
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10)
    .map((e) => ({
      rank: e.rank,
      ghUsername: e.ghUsername,
      score: e.score,
      weight: e.weight,
    }));
}

// Re-export the asc helper so the explore filter file doesn't reach into drizzle.
export { asc };
