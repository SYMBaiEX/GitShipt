import { Suspense } from "react";
import { rewardModeOf } from "@repo/shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { Card } from "@repo/ui";
import { Button } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { getProjectPageData } from "@/lib/queries/project-page";
import { getProjectSnapshots } from "@/lib/queries/discovery";
import { formatSol } from "@repo/lib";
import { SnapshotRow } from "./_components/SnapshotRow";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) return { title: `${org}/${repo} · Snapshots` };
  return {
    title: `${data.header.name} · Snapshots`,
    description: `Historical leaderboard snapshots and Merkle roots for ${data.header.slug}.`,
  };
}

const PAGE_SIZE = 50;

export default function ProjectSnapshotsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProjectSnapshotsPageContent
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function ProjectSnapshotsPageContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ org, repo }, sp] = await Promise.all([params, searchParams]);
  const data = await getProjectPageData(org, repo);
  if (!data) notFound();

  const { header } = data;
  const ownerRewards = rewardModeOf(header.payoutConfig) === "owner";
  const slug = `${header.ghOwner}/${header.ghRepo}`;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  // Page-N support: pull one extra row so the Next link is exact even when
  // the ledger length is an exact multiple of PAGE_SIZE.
  const allSnapshots = await getProjectSnapshots(
    header.id,
    page * PAGE_SIZE + 1,
  );
  const startIdx = (page - 1) * PAGE_SIZE;
  const snapshots = allSnapshots.slice(startIdx, startIdx + PAGE_SIZE);
  const hasNextPage = allSnapshots.length > startIdx + PAGE_SIZE;
  const visibleTotals = snapshots.reduce(
    (acc, row) => {
      acc.fees += row.totalFeesLamports;
      if (row.status === "paid") acc.paid += 1;
      return acc;
    },
    { fees: 0n, paid: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/explore" },
          { label: header.name, href: `/r/${slug}` },
          { label: "Snapshots" },
        ]}
      />

      {ownerRewards ? (
        <p className="text-body-sm text-fg-secondary">
          Snapshots show informational rankings and do not allocate owner
          rewards.
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Snapshots shown"
          value={snapshots.length.toLocaleString("en-US")}
        />
        {!ownerRewards ? (
          <>
            <SummaryTile
              label="Paid cycles"
              value={visibleTotals.paid.toLocaleString("en-US")}
            />
            <SummaryTile
              label="Fees captured"
              value={formatSol(visibleTotals.fees, 4)}
              mono
            />
          </>
        ) : null}
      </section>

      <Card depth="raised" padding="none" className="overflow-hidden">
        {snapshots.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_140px_170px_96px] items-center gap-3 border-b border-border bg-surface-elevated/40 px-5 py-2.5 text-label-sm text-fg-muted">
              <div>When</div>
              <div className="text-right">{ownerRewards ? "" : "Status"}</div>
              <div className="text-right">
                {ownerRewards ? "" : "Recipients"}
              </div>
              <div className="text-right">{ownerRewards ? "" : "Fees"}</div>
              <div className="text-right">Merkle root</div>
              <div />
            </div>
            <ul className="divide-y divide-border">
              {snapshots.map((row) => (
                <SnapshotRow
                  key={row.id}
                  row={row}
                  informational={ownerRewards}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {(page > 1 || hasNextPage) && (
        <Pagination slug={slug} page={page} hasNextPage={hasNextPage} />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <History className="size-10 text-fg-muted" aria-hidden />
      <div className="text-headline-sm text-fg">No snapshots yet</div>
      <p className="max-w-md text-body-md text-fg-secondary">
        The first snapshot lands at 00:00 UTC after the project goes live.
      </p>
    </div>
  );
}

function Pagination({
  slug,
  page,
  hasNextPage,
}: {
  slug: string;
  page: number;
  hasNextPage: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-body-sm text-fg-secondary">
      <Button
        asChild
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        className={page <= 1 ? "pointer-events-none opacity-40" : ""}
      >
        {page > 1 ? (
          <Link
            href={
              page - 1 === 1
                ? `/r/${slug}/snapshots`
                : `/r/${slug}/snapshots?page=${page - 1}`
            }
          >
            ← Newer
          </Link>
        ) : (
          <span>← Newer</span>
        )}
      </Button>
      <span className="text-caption text-fg-muted">
        Page {page}
        {hasNextPage ? "" : " · end"}
      </span>
      <Button
        asChild
        variant="ghost"
        size="sm"
        disabled={!hasNextPage}
        className={!hasNextPage ? "pointer-events-none opacity-40" : ""}
      >
        {hasNextPage ? (
          <Link href={`/r/${slug}/snapshots?page=${page + 1}`}>Older →</Link>
        ) : (
          <span>Older →</span>
        )}
      </Button>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 px-4 py-3">
      <div className="text-caption text-fg-muted">{label}</div>
      <div
        className={`mt-1 text-fg ${mono ? "text-mono-md" : "text-headline-sm font-semibold"}`}
      >
        {value}
      </div>
    </div>
  );
}
