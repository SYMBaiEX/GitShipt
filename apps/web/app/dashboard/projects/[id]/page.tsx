import { Suspense } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Coins,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { hasCredentials } from "@/lib/env";
import {
  getProjectKPIs,
  getRecentProjectAudit,
  getFailedPayoutsForProject,
  getIndexerState,
  type RecentAuditEntry,
  type FailedPayoutAlert,
  type IndexerState,
} from "@/lib/queries/dashboard";
import { formatSol, formatRelativeTime } from "@repo/lib";
import { loadProjectFor } from "../../_components/loadProject";
import { StatTile } from "@/components/shared/StatTile";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { RelativeTime } from "@/components/shared/RelativeTime";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ManagerDelegationStep } from "@/app/(public)/launch/_components/ManagerDelegationStep";
import { currentSolanaCluster } from "@/lib/solana/explorer";

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProjectOverviewPageContent params={params} />
    </Suspense>
  );
}

async function ProjectOverviewPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) {
    return <StubShell />;
  }
  const { id } = await params;
  const ctx = await loadProjectFor(id, "project.read");
  const { project } = ctx;

  const [kpis, audit, failed, indexer] = await Promise.all([
    getProjectKPIs(id),
    getRecentProjectAudit(id, 10),
    getFailedPayoutsForProject(id, 5),
    getIndexerState(id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Projects", href: "/dashboard/projects" },
            { label: project.name },
          ]}
        />
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastSyncAt={indexer?.lastIncrementalSyncAt ?? null}
            label="Indexer"
          />
          <Button asChild variant="secondary" size="default">
            <Link
              href={`/r/${project.slug}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              View public page <ExternalLink className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Contributors Ranked"
          value={kpis.totalContributorsRanked.toString()}
          icon={Users}
        />
        <StatTile
          label="Payouts Executed"
          value={kpis.totalPayoutsExecuted.toString()}
          icon={Trophy}
        />
        <StatTile
          label="Lifetime Fees"
          value={formatSol(kpis.lifetimeFeesLamports, 4)}
          icon={Coins}
          accent="primary"
        />
        <StatTile
          label="GitShipt Custody"
          value="0.0000 SOL"
          icon={Sparkles}
          sub={
            kpis.lastSnapshotAt
              ? `last snapshot ${formatRelativeTime(kpis.lastSnapshotAt)}`
              : "no snapshots yet"
          }
        />
      </section>

      {project.status === "live" && !project.managerPubkey ? (
        <Card depth="raised" padding="default" className="border-warning/50">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-warning-soft text-warning">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-headline-sm text-fg">Launch incomplete</h2>
                <p className="mt-1 max-w-2xl text-body-sm text-fg-secondary">
                  The Bags launch transaction is recorded, but GitShipt cannot
                  run scheduled BPS rebalances until the owner delegates the
                  manager role. Contributor claims remain in Bags; cadence
                  automation starts after this signature lands.
                </p>
              </div>
            </div>
            <Badge variant="warning" size="sm">
              Delegation pending
            </Badge>
          </div>
          <div className="mt-4">
            <ManagerDelegationStep
              projectId={project.id}
              cluster={currentSolanaCluster()}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RecentActivityCard rows={audit} />
        <AlertsCard failed={failed} indexer={indexer} projectId={id} />
      </div>
    </div>
  );
}

function RecentActivityCard({ rows }: { rows: RecentAuditEntry[] }) {
  return (
    <Card depth="flat" padding="none">
      <CardHeader className="border-b border-border px-6 py-4">
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>
          Last 10 admin actions on this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-body-md text-fg-secondary">
            No audit events yet — actions you take here will appear in real
            time.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 px-6 py-3 text-body-md"
              >
                <Activity
                  className="mt-0.5 size-4 shrink-0 text-fg-muted"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-label-md text-fg">
                      {humanizeAction(r.action)}
                    </span>
                    <RelativeTime
                      date={r.createdAt}
                      className="text-caption text-fg-muted"
                    />
                  </div>
                  <div className="text-caption text-fg-muted truncate">
                    {r.actorName ?? "system"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsCard({
  failed,
  indexer,
  projectId,
}: {
  failed: FailedPayoutAlert[];
  indexer: IndexerState | null;
  projectId: string;
}) {
  const indexerStale = indexer?.isStale ?? false;
  const hasAlerts = failed.length > 0 || indexerStale;
  return (
    <Card depth="flat" padding="none">
      <CardHeader className="border-b border-border px-6 py-4">
        <CardTitle>Alerts</CardTitle>
        <CardDescription>
          Things that need your attention right now.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!hasAlerts ? (
          <div className="px-6 py-10 text-center">
            <Badge variant="success" dot size="sm">
              All clear
            </Badge>
            <p className="mt-2 text-body-sm text-fg-secondary">
              No failed payouts. Indexer is fresh.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {failed.map((f) => (
              <li key={f.id} className="px-6 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-danger" aria-hidden />
                  <span className="text-label-md text-fg">Payout failed</span>
                  <Badge variant="danger" size="sm">
                    attempt {f.attemptCount}
                  </Badge>
                </div>
                {f.lastError ? (
                  <p className="mt-1 text-caption text-fg-muted truncate">
                    {f.lastError}
                  </p>
                ) : null}
                <Link
                  href={`/dashboard/projects/${projectId}/payouts`}
                  className="mt-1 inline-flex text-label-sm text-primary-readable hover:underline"
                >
                  Review &amp; retry
                </Link>
              </li>
            ))}
            {indexerStale ? (
              <li className="px-6 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" aria-hidden />
                  <span className="text-label-md text-fg">
                    Indexer is stale
                  </span>
                </div>
                <p className="mt-1 text-caption text-fg-muted">
                  {indexer?.lastIncrementalSyncAt ? (
                    <>
                      Last sync{" "}
                      <RelativeTime date={indexer.lastIncrementalSyncAt} />
                    </>
                  ) : (
                    "Never synced"
                  )}
                  . Open Repository to inspect link state.
                </p>
              </li>
            ) : null}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function humanizeAction(action: string): string {
  return action
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" · ");
}

function StubShell() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="DATABASE_URL or POSTGRES_URL is not configured. Per-project console comes online when Postgres is provisioned."
      />
    </div>
  );
}
