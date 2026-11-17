import { Github } from "@repo/ui";
import { Suspense } from "react";
import { rewardModeOf } from "@repo/shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  GitBranch,
  GitFork,
  RefreshCw,
  Star,
} from "lucide-react";
import { getProjectPageData } from "@/lib/queries/project-page";
import { getIndexerState } from "@/lib/queries/dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CopyButton } from "@/components/shared/CopyButton";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { formatAddress } from "@repo/lib";
import { languageColor } from "@repo/lib";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) return { title: `${org}/${repo} · Repository` };
  return {
    title: `${data.header.name} · Repository`,
    description: `Repository info and indexer state for ${data.header.slug}.`,
  };
}

export default function ProjectRepositoryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ProjectRepositoryPageContent params={params} />
    </Suspense>
  );
}

async function ProjectRepositoryPageContent({ params }: { params: Params }) {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) notFound();

  const { header } = data;

  const indexerRow = await getIndexerState(header.id);

  const repoUrl = `https://github.com/${header.ghOwner}/${header.ghRepo}`;
  const installed = header.status === "live";

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/explore" },
          {
            label: header.name,
            href: `/r/${header.ghOwner}/${header.ghRepo}`,
          },
          { label: "Repository" },
        ]}
      />

      {/* Public repo info */}
      <Card depth="raised" padding="default">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>GitHub repository</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href={repoUrl} target="_blank" rel="noreferrer noopener">
              Open on GitHub <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Repo"
            icon={<Github className="size-3.5" />}
            value={`${header.ghOwner}/${header.ghRepo}`}
          />
          <Stat
            label="Language"
            dotColor={header.language ? languageColor(header.language) : null}
            value={header.language ?? "—"}
          />
          <Stat
            label="Stars"
            icon={<Star className="size-3.5" />}
            value={header.stars.toLocaleString("en-US")}
            mono
          />
          <Stat
            label="Forks"
            icon={<GitFork className="size-3.5" />}
            value={header.forks.toLocaleString("en-US")}
            mono
          />
        </CardContent>
      </Card>

      {/* Indexer state */}
      <Card depth="raised" padding="default">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Indexer status</CardTitle>
          <Badge
            variant={installed ? "success" : "warning"}
            dot={installed}
            size="sm"
          >
            {installed ? "Installed" : "Not installed"}
          </Badge>
        </CardHeader>
        <CardContent className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="App installation"
            value={header.tokenMint ? "Active" : "Pending owner action"}
          />
          <Stat
            label="Last incremental sync"
            icon={<RefreshCw className="size-3.5" />}
            value={
              indexerRow?.lastIncrementalSyncAt ? (
                <RelativeTime date={indexerRow.lastIncrementalSyncAt} />
              ) : (
                "Never"
              )
            }
          />
          <Stat
            label="Last full sync"
            value={
              indexerRow?.lastFullSyncAt ? (
                <RelativeTime date={indexerRow.lastFullSyncAt} />
              ) : (
                "Never"
              )
            }
          />
          <Stat
            label="Last commit indexed"
            icon={<GitBranch className="size-3.5" />}
            value={
              indexerRow?.lastCommitSha ? (
                <span className="inline-flex items-center gap-1">
                  <span title={indexerRow.lastCommitSha}>
                    {formatAddress(indexerRow.lastCommitSha, 7, 0)}
                  </span>
                  <CopyButton
                    value={indexerRow.lastCommitSha}
                    label="Copy commit SHA"
                  />
                </span>
              ) : (
                "—"
              )
            }
            mono
          />
        </CardContent>
        {indexerRow?.lastError ? (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-body-sm text-danger">
            <span className="font-medium">Last error:</span>{" "}
            {indexerRow.lastError}
          </div>
        ) : null}
      </Card>

      {/* What's tracked */}
      <Card depth="raised" padding="default">
        <CardHeader>
          <CardTitle>What feeds the leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Signal
            label="Default-branch commits"
            detail="Skipping merge commits and bot accounts"
          />
          <Signal
            label="Merged pull requests"
            detail="Self-merge weighted 0.5×"
          />
          <Signal
            label="Window"
            detail={`${header.scoringConfig.windowDays} days`}
          />
          <Signal label="Time decay" detail={header.scoringConfig.decay} />
          <Signal
            label="Bot exclusion"
            detail="dependabot, renovate, *-bot, *-ci + project allowlist/blocklist"
          />
          <Signal
            label="Top-N"
            detail={
              rewardModeOf(header.payoutConfig) === "owner"
                ? "Rankings are informational"
                : `Top ${header.payoutConfig.topN} contributors paid each cycle`
            }
          />
        </CardContent>
      </Card>

      <p className="text-caption text-fg-muted">
        Want a deeper look? See the{" "}
        <Link
          href={`/r/${header.ghOwner}/${header.ghRepo}/snapshots`}
          className="text-fg-secondary underline-offset-4 hover:text-fg hover:underline"
        >
          snapshot ledger
        </Link>{" "}
        for every freeze, or read the{" "}
        <Link
          href="/docs"
          className="text-fg-secondary underline-offset-4 hover:text-fg hover:underline"
        >
          scoring docs
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  dotColor,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  dotColor?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-3 py-2.5">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        {dotColor ? (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: dotColor }}
            aria-hidden
          />
        ) : icon ? (
          <span className="text-fg-muted">{icon}</span>
        ) : null}
        <span
          className={`min-w-0 truncate ${
            mono ? "text-mono-md text-fg" : "text-body-md text-fg"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function Signal({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-surface-elevated/40 px-3 py-2">
      <span className="text-body-sm text-fg-secondary">{label}</span>
      <span className="text-mono-sm text-fg">{detail}</span>
    </div>
  );
}
