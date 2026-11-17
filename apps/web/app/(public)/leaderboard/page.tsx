import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getGlobalLeaderboard,
  getPlatformIndexerHeartbeat,
} from "@/lib/queries/global";
import { GlobalLeaderboardTable } from "./_components/GlobalLeaderboardTable";
import { LeaderboardFilters } from "./_components/LeaderboardFilters";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import type {
  GlobalLeaderboardEntry,
  GlobalProjectEntry,
} from "@/lib/queries/global";

export const metadata: Metadata = {
  title: "Global leaderboard",
  description:
    "Top contributors and projects across every GitShipt repo, ranked by lifetime SOL earned.",
};

type Mode = "contributor" | "project";

function parseMode(value: string | string[] | undefined): Mode {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "project" ? "project" : "contributor";
}

function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim().toLowerCase() ?? "";
}

/**
 * Public global leaderboard. Two views (contributor / project) selected via
 * the `?mode=` search param. Toggle is a server-rendered pair of `<Link>`s
 * — no client JS needed for navigation, and the active state survives
 * sharing/bookmarking the URL.
 */

export default function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={null}>
      <LeaderboardPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LeaderboardPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  const query = parseQuery(params.q);
  const [data, indexerHeartbeat] = await Promise.all([
    getGlobalLeaderboard(),
    getPlatformIndexerHeartbeat(),
  ]);
  const contributorRows = filterContributors(data.byContributor, query);
  const projectRows = filterProjects(data.byProject, query);
  const emptyMessage = query
    ? "No matches."
    : "No payouts have been confirmed yet.";

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-headline-lg">Global leaderboard</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LeaderboardFilters mode={mode} />
        <LiveIndicator lastSyncAt={indexerHeartbeat} label="Indexer" />
      </div>

      {mode === "contributor" ? (
        <GlobalLeaderboardTable
          mode="contributor"
          rows={contributorRows}
          emptyMessage={emptyMessage}
        />
      ) : (
        <GlobalLeaderboardTable
          mode="project"
          rows={projectRows}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
}

function filterContributors(
  rows: GlobalLeaderboardEntry[],
  query: string,
): GlobalLeaderboardEntry[] {
  if (!query) return rows;
  return rows.filter((row) =>
    [row.ghUsername, row.topProjectSlug ?? ""].some((value) =>
      value.toLowerCase().includes(query),
    ),
  );
}

function filterProjects(
  rows: GlobalProjectEntry[],
  query: string,
): GlobalProjectEntry[] {
  if (!query) return rows;
  return rows.filter((row) =>
    [row.name, row.slug].some((value) => value.toLowerCase().includes(query)),
  );
}
