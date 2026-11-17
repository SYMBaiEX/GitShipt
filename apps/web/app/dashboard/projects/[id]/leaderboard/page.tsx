import { Suspense } from "react";
import { rewardModeOf } from "@repo/shared";
import { Sparkles } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import {
  getProjectLeaderboard,
  getPoolOverview,
  type LeaderboardRow,
} from "@/lib/queries/project-page";
import { loadProjectFor } from "../../../_components/loadProject";
import { LeaderboardTable } from "@/app/r/[org]/[repo]/_components/LeaderboardTable";
import { ScoringConfigEditor } from "./_components/ScoringConfigEditor";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";

export default function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <LeaderboardPageContent params={params} />
    </Suspense>
  );
}

async function LeaderboardPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "scoring.read");
  const { project } = ctx;

  const [rows, pool] = await Promise.all([
    getProjectLeaderboard(project.id, project.payoutConfig),
    // Re-use the public-page pool helper — needs the full ProjectHeader shape.
    // We synthesize one here because the dashboard query doesn't compute it.
    getPoolOverview({
      id: project.id,
      slug: project.slug,
      ghOwner: project.ghOwner,
      ghRepo: project.ghRepo,
      name: project.name,
      description: project.description,
      imageUrl: project.imageUrl,
      tokenMint: project.tokenMint,
      bagsLaunchId: project.bagsLaunchId,
      status: project.status,
      platformFeeBps: project.platformFeeBps,
      scoringConfig: project.scoringConfig,
      payoutConfig: project.payoutConfig,
      contributorsCount: 0,
      createdAt: project.createdAt,
      language: null,
      stars: 0,
      forks: 0,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Leaderboard" },
        ]}
      />

      <div className="min-h-[400px]">
        <LeaderboardTable
          rows={rows as LeaderboardRow[]}
          dailyFeeLamports={pool.dailyFeeLamports}
          dailyFeeUsd={pool.dailyFeeUsd}
          scoringConfig={project.scoringConfig}
          payoutConfig={project.payoutConfig}
        />
      </div>

      {rewardModeOf(project.payoutConfig) !== "owner" ? (
        <ScoringConfigEditor
          projectId={id}
          scoring={project.scoringConfig}
          payout={project.payoutConfig}
        />
      ) : null}
    </div>
  );
}

function Stub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to view the leaderboard."
      />
    </div>
  );
}
