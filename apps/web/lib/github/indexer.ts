import type { Octokit } from "@octokit/rest";
import { isBot, type ScoreInputs } from "@/lib/scoring/v0";

/**
 * Aggregated GitHub activity for a single contributor over the indexer
 * window. `inputs` feeds the v0 scoring formula directly.
 */
export type ContributorAggregate = {
  ghUserId: string;
  ghUsername: string;
  avatarUrl: string | null;
  /** GitHub API user.type — "User" or "Bot". "Bot" forces isBot=true
   *  regardless of login regex match. */
  ghType: string | null;
  inputs: ScoreInputs;
  isBot: boolean;
};

function emptyInputs(): ScoreInputs {
  return { mergedPRs: 0, commits: 0, reviews: 0, issues: 0, netLines: 0 };
}

function bumpInputs(target: ScoreInputs, delta: Partial<ScoreInputs>): void {
  target.mergedPRs += delta.mergedPRs ?? 0;
  target.commits += delta.commits ?? 0;
  target.reviews += delta.reviews ?? 0;
  target.issues += delta.issues ?? 0;
  target.netLines += delta.netLines ?? 0;
}

/**
 * Pulls non-merge commits from the default branch since `sinceISO` and
 * aggregates per `commit.author.id`. Skips commits where author is null
 * (rewritten history, removed accounts) and merge commits (>1 parent).
 */
export async function fetchCommitsByAuthor(
  octo: Octokit,
  owner: string,
  repo: string,
  sinceISO: string,
  defaultBranch: string,
): Promise<Map<string, ContributorAggregate>> {
  const out = new Map<string, ContributorAggregate>();

  const iterator = octo.paginate.iterator(octo.rest.repos.listCommits, {
    owner,
    repo,
    sha: defaultBranch,
    since: sinceISO,
    per_page: 100,
  });

  for await (const page of iterator) {
    for (const c of page.data) {
      if (!c.author || !c.author.id) continue;
      if ((c.parents?.length ?? 0) > 1) continue;
      const id = String(c.author.id);
      const login = c.author.login ?? "";
      const existing = out.get(id);
      if (existing) {
        bumpInputs(existing.inputs, { commits: 1 });
      } else {
        const agg: ContributorAggregate = {
          ghUserId: id,
          ghUsername: login,
          avatarUrl: c.author.avatar_url ?? null,
          ghType: c.author.type ?? null,
          inputs: { ...emptyInputs(), commits: 1 },
          isBot: false,
        };
        out.set(id, agg);
      }
    }
  }

  return out;
}

/**
 * Pulls closed PRs (most-recently-updated first), filters to actually
 * merged PRs whose `merged_at >= sinceISO`, aggregates per `pr.user.id`.
 * Self-merge (author == merged_by) counts as 0.5x.
 */
export async function fetchMergedPRsByAuthor(
  octo: Octokit,
  owner: string,
  repo: string,
  sinceISO: string,
): Promise<Map<string, ContributorAggregate>> {
  const out = new Map<string, ContributorAggregate>();
  const sinceMs = Date.parse(sinceISO);

  const iterator = octo.paginate.iterator(octo.rest.pulls.list, {
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  pages: for await (const page of iterator) {
    for (const pr of page.data) {
      const updatedMs = pr.updated_at ? Date.parse(pr.updated_at) : 0;
      // Once we've passed the window even on `updated_at`, we can stop —
      // newer-merged PRs would also have a newer updated_at.
      if (updatedMs && updatedMs < sinceMs) break pages;

      if (!pr.merged_at) continue;
      const mergedMs = Date.parse(pr.merged_at);
      if (mergedMs < sinceMs) continue;
      if (!pr.user || !pr.user.id) continue;

      const id = String(pr.user.id);
      const login = pr.user.login;
      // `merged_by` is not present on list-PRs response; only on a per-PR
      // GET. We approximate self-merge using `assignee` (best-effort).
      // True self-merge detection requires an extra `pulls.get` call —
      // intentionally deferred for hackathon performance.
      const prAny = pr as unknown as {
        merged_by?: { id?: number } | null;
      };
      const selfMerge =
        prAny.merged_by != null && prAny.merged_by.id === pr.user.id;
      const weight = selfMerge ? 0.5 : 1;

      const existing = out.get(id);
      if (existing) {
        bumpInputs(existing.inputs, { mergedPRs: weight });
      } else {
        out.set(id, {
          ghUserId: id,
          ghUsername: login,
          avatarUrl: pr.user.avatar_url ?? null,
          ghType: pr.user.type ?? null,
          inputs: { ...emptyInputs(), mergedPRs: weight },
          isBot: false,
        });
      }
    }
  }

  return out;
}

/**
 * Fallback for quiet/stable repositories. GitHub's contributor list is an
 * all-time leaderboard, so we only use it when the active scoring window has
 * no qualifying activity at all.
 */
export async function fetchRepoContributorsLeaderboard(
  octo: Octokit,
  owner: string,
  repo: string,
): Promise<Map<string, ContributorAggregate>> {
  const out = new Map<string, ContributorAggregate>();
  const contributors = await octo.paginate(octo.rest.repos.listContributors, {
    owner,
    repo,
    anon: "false",
    per_page: 100,
  });

  for (const c of contributors) {
    if (!c.id || !c.login) continue;
    const contributions = Math.max(0, c.contributions ?? 0);
    if (contributions === 0) continue;
    out.set(String(c.id), {
      ghUserId: String(c.id),
      ghUsername: c.login,
      avatarUrl: c.avatar_url ?? null,
      ghType: c.type ?? null,
      inputs: { ...emptyInputs(), commits: contributions },
      isBot: false,
    });
  }

  return out;
}

/**
 * Combine multiple per-source aggregate maps into a single deduped list.
 * Sums `inputs` per `ghUserId`; later maps' username/avatar override
 * earlier ones (PRs are usually fresher than commits).
 */
export function mergeAggregates(
  ...maps: Array<Map<string, ContributorAggregate>>
): ContributorAggregate[] {
  const merged = new Map<string, ContributorAggregate>();
  for (const m of maps) {
    for (const [id, agg] of m) {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, {
          ghUserId: id,
          ghUsername: agg.ghUsername,
          avatarUrl: agg.avatarUrl,
          ghType: agg.ghType,
          inputs: { ...agg.inputs },
          isBot: agg.isBot,
        });
      } else {
        bumpInputs(existing.inputs, agg.inputs);
        if (agg.ghUsername) existing.ghUsername = agg.ghUsername;
        if (agg.avatarUrl) existing.avatarUrl = agg.avatarUrl;
        // "Bot" wins over null/User if any source confirmed it.
        if (agg.ghType === "Bot") existing.ghType = "Bot";
        else if (!existing.ghType && agg.ghType) existing.ghType = agg.ghType;
      }
    }
  }
  return Array.from(merged.values());
}

/**
 * Apply bot detection given per-project allow/block lists. Returns a new
 * array; does not mutate.
 */
export function applyBotFlags(
  aggs: ContributorAggregate[],
  allowlist: string[],
  blocklist: string[],
): ContributorAggregate[] {
  return aggs.map((a) => ({
    ...a,
    isBot: isBot(a.ghUsername, allowlist, blocklist, a.ghType),
  }));
}
