import "server-only";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { dbHttp } from "@/db";
import { projects } from "@/db/schema";

/**
 * Cache tags + revalidation helpers.
 *
 * Read-side caching uses Next Cache Components, including remote caching
 * for shared public catalog aggregates (see
 * lib/queries/* call sites). Tags emitted from inside those cached
 * functions match the names in `cacheTags` here, so the helpers below
 * (revalidatePublicCaches, revalidateProjectCaches, etc.) are the single
 * source of truth for invalidation. Server actions and admin mutations
 * call these helpers — never `revalidateTag` directly — so the tag set
 * stays in lockstep with the read side.
 */

export const cacheTags = {
  public: "gitshipt:public",
  landing: "gitshipt:landing",
  explore: "gitshipt:explore",
  globalLeaderboard: "gitshipt:global-leaderboard",
  liveTicker: "gitshipt:live-ticker",
  launch: "gitshipt:launch",
  dashboard: "gitshipt:dashboard",
  admin: "gitshipt:admin",
  adminAudit: "gitshipt:admin-audit",
  adminUsers: "gitshipt:admin-users",
  platformConfig: "gitshipt:platform-config",
  user: (userId: string) => `gitshipt:user:${userId}`,
  linkedWallets: (userId: string) => `gitshipt:linked-wallets:${userId}`,
  dashboardUser: (userId: string) => `gitshipt:dashboard-user:${userId}`,
  dashboardProject: (projectId: string) =>
    `gitshipt:dashboard-project:${projectId}`,
  project: (projectId: string) => `gitshipt:project:${projectId}`,
  projectSlug: (slug: string) => `gitshipt:project-slug:${slug}`,
  projectPayouts: (projectId: string) => `gitshipt:project-payouts:${projectId}`,
  projectSnapshots: (projectId: string) =>
    `gitshipt:project-snapshots:${projectId}`,
  contributor: (username: string) =>
    `gitshipt:contributor:${username.toLowerCase()}`,
  githubUser: (username: string) =>
    `gitshipt:github-user:${username.toLowerCase()}`,
} as const;

export function revalidateCacheTags(tags: Iterable<string>): void {
  for (const tag of new Set(tags)) {
    revalidateTag(tag, "max");
  }
}

export function revalidatePublicCaches(): void {
  revalidateCacheTags([
    cacheTags.public,
    cacheTags.landing,
    cacheTags.explore,
    cacheTags.globalLeaderboard,
    cacheTags.liveTicker,
    cacheTags.launch,
  ]);
}

export function revalidateAdminCaches(): void {
  revalidateCacheTags([
    cacheTags.admin,
    cacheTags.adminAudit,
    cacheTags.adminUsers,
    cacheTags.platformConfig,
  ]);
}

export function revalidateUserCaches(userId: string): void {
  revalidateCacheTags([
    cacheTags.dashboard,
    cacheTags.user(userId),
    cacheTags.dashboardUser(userId),
  ]);
}

export function revalidateLinkedWallets(userId: string): void {
  revalidateTag(cacheTags.linkedWallets(userId), { expire: 0 });
  revalidateUserCaches(userId);
}

export async function revalidateProjectCaches(
  projectId: string,
  slug?: string,
): Promise<void> {
  let resolvedSlug = slug;
  if (!resolvedSlug) {
    const [row] = await dbHttp
      .select({ ghOwner: projects.ghOwner, ghRepo: projects.ghRepo })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (row) resolvedSlug = `${row.ghOwner}/${row.ghRepo}`;
  }

  revalidatePublicCaches();
  revalidateCacheTags([
    cacheTags.dashboard,
    cacheTags.admin,
    cacheTags.project(projectId),
    cacheTags.dashboardProject(projectId),
    cacheTags.projectPayouts(projectId),
    cacheTags.projectSnapshots(projectId),
    ...(resolvedSlug ? [cacheTags.projectSlug(resolvedSlug)] : []),
  ]);
}

export function revalidateContributorCaches(usernames: Iterable<string>): void {
  revalidatePublicCaches();
  revalidateCacheTags(
    Array.from(usernames, (username) => cacheTags.contributor(username)),
  );
}
