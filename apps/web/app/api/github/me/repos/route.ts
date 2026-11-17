import "server-only";
import { headers } from "next/headers";
import { Octokit } from "@octokit/rest";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { dbHttp } from "@/db";
import { accounts, projects } from "@/db/schema";
import { withRlsContext } from "@/db/rls-context";
import { check } from "@/lib/rate-limit";
import { hasCredentials } from "@/lib/env";
import { redis } from "@/lib/redis";
import { privateNoStoreJson } from "@/lib/no-store-response";
import {
  GithubReposResponseSchema,
  type GithubRepo,
} from "@repo/shared";


const CACHE_TTL_SECONDS = 30;

interface GithubRepoApiResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  homepage: string | null;
  topics?: string[];
  default_branch: string | null;
  license: { spdx_id: string | null; key: string | null; name: string | null } | null;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
  owner: {
    login: string;
    avatar_url: string;
  };
}

/**
 * List the authed user's admin-permission GitHub repos for the launch wizard.
 *
 * Reads the GitHub OAuth access token from `accounts.access_token` (better-auth
 * persists it there during OAuth callback). Calls Octokit user-context
 * `GET /user/repos`. Filters to repos where `permissions.admin === true`.
 *
 * Repos that already exist in `projects` are tagged so the UI can react
 * appropriately:
 *  - Statuses `live` / `paused` / `killed` / `simulated_live` →
 *    `alreadyLaunched: true` (UI disables the row)
 *  - Statuses `draft` / `launch_configured` →
 *    `draftProjectId: <id>` (UI shows "Continue draft" and links to the
 *    project console so the user can resume)
 *
 * Cached 30s in Redis under `gitshipt:gh:me:repos:{userId}`.
 */
export async function GET(req: Request): Promise<Response> {
  if (!hasCredentials.github()) {
    return privateNoStoreJson(
      { error: "auth_unavailable", message: "GitHub OAuth not configured." },
      { status: 503 },
    );
  }
  if (!hasCredentials.db()) {
    return privateNoStoreJson(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  // Rate-limit GET reads with the default limiter (60/min/user).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return privateNoStoreJson(
      { error: "unauthorized", message: "Sign in with GitHub to list repos." },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  const limit = await check("default", `gh-repos:${userId ?? ip}`);
  if (!limit.success) {
    return privateNoStoreJson({ error: "rate_limited" }, { status: 429 });
  }

  // Cache hit?
  const r = redis();
  const cacheKey = `gitshipt:gh:me:repos:${userId}`;
  if (r) {
    const cached = await r.get(cacheKey);
    if (cached) {
      try {
        const parsed = GithubReposResponseSchema.parse(JSON.parse(cached));
        return privateNoStoreJson(parsed, {
          headers: { "x-cache": "HIT" },
        });
      } catch {
        // fall through and re-fetch
      }
    }
  }

  // Look up the GitHub access token from the better-auth `accounts` table.
  const [account] = await withRlsContext(
    { mode: "user", userId, role: "user", reason: "launch:github-repos" },
    () => dbHttp
      .select({ accessToken: accounts.accessToken })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "github")))
      .limit(1),
  );

  if (!account?.accessToken) {
    return privateNoStoreJson(
      {
        error: "missing_github_token",
        message:
          "No GitHub OAuth token on file. Sign out and sign back in with GitHub.",
      },
      { status: 401 },
    );
  }

  const octokit = new Octokit({ auth: account.accessToken });

  let raw: GithubRepoApiResponse[];
  try {
    const resp = await octokit.request("GET /user/repos", {
      per_page: 100,
      affiliation: "owner",
      visibility: "public",
      sort: "updated",
    });
    raw = resp.data as GithubRepoApiResponse[];
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "GitHub list-repos failed.";
    return privateNoStoreJson(
      { error: "github_error", message },
      { status: 502 },
    );
  }

  const adminRepos = raw.filter((r) => r.permissions?.admin === true);

  // Look up which of these repos already have a project.
  const ownerRepoPairs = adminRepos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
  }));
  const launchedSet = new Set<string>();
  const draftByRepo = new Map<string, string>();
  // Statuses where the project hasn't actually been broadcast yet — the
  // repo should still be reachable from the wizard via "Continue draft".
  const draftStatuses = new Set(["draft", "launch_configured"]);
  if (ownerRepoPairs.length > 0) {
    // Single round-trip: pull every project for these owners and filter
    // by repo names client-side. Owners list is bounded by GitHub's 100
    // per_page, so this is cheap.
    const ownerLogins = Array.from(new Set(ownerRepoPairs.map((p) => p.owner)));
    if (ownerLogins.length > 0) {
      const existing = await dbHttp
        .select({
          id: projects.id,
          ghOwner: projects.ghOwner,
          ghRepo: projects.ghRepo,
          status: projects.status,
        })
        .from(projects);
      for (const row of existing) {
        if (!ownerLogins.includes(row.ghOwner)) continue;
        const key = `${row.ghOwner}/${row.ghRepo}`;
        if (draftStatuses.has(row.status)) {
          draftByRepo.set(key, row.id);
        } else {
          launchedSet.add(key);
        }
      }
    }
  }

  const repos: GithubRepo[] = adminRepos.map((r) => ({
    id: String(r.id),
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    stargazersCount: r.stargazers_count,
    forksCount: r.forks_count,
    ownerAvatarUrl: r.owner.avatar_url,
    alreadyLaunched: launchedSet.has(r.full_name),
    draftProjectId: draftByRepo.get(r.full_name) ?? null,
    homepage: normalizeHomepage(r.homepage),
    topics: r.topics ?? [],
    license: r.license?.spdx_id ?? null,
    defaultBranch: r.default_branch,
  }));

  const responseBody = GithubReposResponseSchema.parse({
    repos,
    visibilityNote:
      "Showing public repos you administer. Grant the `repo` scope to also list private repos.",
  });

  if (r) {
    await r.set(
      cacheKey,
      JSON.stringify(responseBody),
      "EX",
      CACHE_TTL_SECONDS,
    );
  }

  return privateNoStoreJson(responseBody, {
    headers: { "x-cache": "MISS" },
  });
}

// GitHub returns "" or null for repos with no homepage. Treat both as absent.
// Don't validate URL shape here — the wizard form runs Zod URL validation
// before submit, so junk values just won't auto-fill the website field.
function normalizeHomepage(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
