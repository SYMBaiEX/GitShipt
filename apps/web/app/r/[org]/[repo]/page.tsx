import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { rewardModeOf } from "@repo/shared";
import { getProjectPageData } from "@/lib/queries/project-page";
import { getTokenStats } from "@/lib/queries/token-stats";
import { ProjectHeader } from "./_components/ProjectHeader";
import { NextPayoutCountdown } from "./_components/NextPayoutCountdown";
import { LeaderboardTable } from "./_components/LeaderboardTable";
import { PoolOverviewCard } from "./_components/PoolOverviewCard";
import { RecentPayoutsFeed } from "./_components/RecentPayoutsFeed";
import { RepoStatsList } from "./_components/RepoStatsList";
import { TokenStatsRow } from "./_components/TokenStatsRow";

type Params = { org: string; repo: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) {
    return { title: `${org}/${repo}` };
  }
  return {
    title: `${data.header.name} · Leaderboard`,
    description:
      data.header.description ??
      `Token and contribution rankings for ${data.header.ghOwner}/${data.header.ghRepo}.`,
  };
}

/**
 * Public project page (`/r/[org]/[repo]`).
 *
 * The route segment layout owns persistent project chrome. This page only
 * renders the leaderboard content so navigating between project tabs does not
 * remount the sidebar or briefly fall back to visitor state.
 */
export default function ProjectPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={null}>
      <ProjectPageContent params={params} />
    </Suspense>
  );
}

async function ProjectPageContent({ params }: { params: Promise<Params> }) {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) {
    notFound();
  }

  const { header, leaderboard, pool, recentPayouts, nextPayoutAt } = data;
  const tokenStats = await getTokenStats(header);
  const ownerRewards = rewardModeOf(header.payoutConfig) === "owner";

  return (
    <>
      {/* Bento content. Mobile (< lg): vertical scroll, single column.
          Desktop (lg+): the page slots into the viewport — main is
          overflow-hidden, header spans both cols, leaderboard +
          right-rail fill the remaining height with their own internal
          scroll where needed. No page scroll, no double-scrollbars. */}
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        {/* Row 1: hero (avatar + name + description) | repo stats list */}
        <div className="min-w-0 lg:self-start">
          <ProjectHeader header={header} />
        </div>
        <div className="min-w-0 lg:self-start">
          <RepoStatsList header={header} />
        </div>

        {/* Row 2 col 1: token stats strip — width-matched to the
                  leaderboard column so it never extends past it. */}
        <div className="min-w-0 lg:col-start-1">
          <TokenStatsRow stats={tokenStats} />
        </div>

        {/* Row 2-3 col 2: aside spans both rows so the right rail
                  starts higher up, fills the available height, and the
                  countdown isn't pinched by row 3's flex height. */}
        <aside
          aria-label="Project economics"
          className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto lg:[scrollbar-width:thin] lg:[scrollbar-color:var(--border-strong)_transparent]"
        >
          {ownerRewards ? (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-label-md text-fg">Owner rewards</h2>
              <p className="mt-2 text-body-sm text-fg-secondary">
                The configured owner wallet receives the owner share through
                Bags. Contributor rankings are informational.
              </p>
            </div>
          ) : (
            <>
              <NextPayoutCountdown targetIso={nextPayoutAt.toISOString()} />
              <PoolOverviewCard pool={pool} projectStatus={header.status} />
              <RecentPayoutsFeed
                payouts={recentPayouts}
                projectSlug={header.slug}
              />
            </>
          )}
        </aside>

        {/* Row 3 col 1: leaderboard fills the remaining vertical space */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-3 lg:min-h-0">
          <LeaderboardTable
            rows={leaderboard}
            dailyFeeLamports={pool.dailyFeeLamports}
            dailyFeeUsd={pool.dailyFeeUsd}
            scoringConfig={header.scoringConfig}
            payoutConfig={header.payoutConfig}
          />
        </div>
      </div>
    </>
  );
}
