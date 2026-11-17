import { Suspense } from "react";
import { rewardModeOf } from "@repo/shared";
import {
  Bot,
  Calculator,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { loadProjectFor } from "../../../_components/loadProject";
import {
  getProjectLeaderboard,
  type LeaderboardRow,
} from "@/lib/queries/project-page";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { Badge } from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ScoringConfigEditor } from "../leaderboard/_components/ScoringConfigEditor";

export default function ScoringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ScoringPageContent params={params} />
    </Suspense>
  );
}

async function ScoringPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "scoring.read");
  const { project } = ctx;
  if (rewardModeOf(project.payoutConfig) === "owner") {
    return (
      <div className="space-y-3">
        <h1 className="text-headline-md">Contribution scoring</h1>
        <p className="text-body-md text-fg-secondary">
          Rankings are informational for owner rewards and do not determine
          payments.
        </p>
      </div>
    );
  }
  const rows = (await getProjectLeaderboard(
    project.id,
    project.payoutConfig,
  )) as LeaderboardRow[];
  const ranked = rows.length;
  const paying = Math.min(ranked, project.payoutConfig.topN);
  const topScore = rows[0]?.score ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Scoring" },
        ]}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={Trophy}
          label="Paying ranks"
          value={`${paying}/${project.payoutConfig.topN}`}
          detail={`${ranked} ranked contributors`}
        />
        <MetricCard
          icon={Calculator}
          label="Top score"
          value={topScore.toFixed(2)}
          detail={`${project.scoringConfig.windowDays} day window`}
        />
        <MetricCard
          icon={Bot}
          label="Bot rules"
          value={`${project.scoringConfig.botBlocklist.length}/${project.scoringConfig.botAllowlist.length}`}
          detail="blocklist / allowlist entries"
        />
      </section>

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-fg-secondary" /> Current formula
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-5">
          <pre className="overflow-x-auto rounded-md border border-border bg-surface px-4 py-3 text-mono-sm text-fg">
            {`score = ${project.scoringConfig.weights.mergedPRs} * mergedPRs
      + ${project.scoringConfig.weights.commits} * commits
      + ${project.scoringConfig.weights.reviews} * reviews
      + ${project.scoringConfig.weights.issues} * issues
      + ${project.scoringConfig.weights.netLines} * log10(1 + netLines)`}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" size="sm">
              formula {project.scoringConfig.formulaVersion}
            </Badge>
            <Badge variant="default" size="sm">
              decay {project.scoringConfig.decay}
            </Badge>
            <Badge variant="default" size="sm">
              threshold{" "}
              <span className="text-mono-sm">
                {project.payoutConfig.claimThresholdLamports}
              </span>{" "}
              lamports
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ScoringConfigEditor
        projectId={id}
        scoring={project.scoringConfig}
        payout={project.payoutConfig}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card depth="flat" padding="default">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label-sm text-fg-secondary">{label}</p>
          <p className="mt-1 text-mono-md text-fg">{value}</p>
          <p className="mt-1 text-caption text-fg-muted">{detail}</p>
        </div>
        <span className="grid size-8 place-items-center rounded-md bg-surface-elevated text-fg-muted">
          <Icon className="size-4" />
        </span>
      </div>
    </Card>
  );
}

function Stub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to view scoring."
      />
    </div>
  );
}
