import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";
import { getProjectPageData } from "@/lib/queries/project-page";
import { getProjectPayoutHistory } from "@/lib/queries/dashboard";
import { Card } from "@repo/ui";
import { Badge } from "@repo/ui";
import { Button } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CopyButton } from "@/components/shared/CopyButton";
import { formatSol, formatRelativeTime, formatAddress } from "@repo/lib";
import { clusterLabel, solscanTxUrl } from "@/lib/solana/explorer";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const data = await getProjectPageData(org, repo);
  if (!data) return { title: `${org}/${repo} · Payouts` };
  return {
    title: `${data.header.name} · Payouts`,
    description: `Daily payout history for ${data.header.slug} on ${clusterLabel()}.`,
  };
}

const PAGE_SIZE = 50;

export default function ProjectPayoutsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProjectPayoutsPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectPayoutsPageContent({
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
  const page = Math.max(1, Number(sp.page ?? 1));
  const allPayouts = await getProjectPayoutHistory(header.id, page * PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const pagePayouts = allPayouts.slice(start, start + PAGE_SIZE);
  const hasMore = allPayouts.length === page * PAGE_SIZE;

  const totals = allPayouts.reduce(
    (acc, p) => {
      acc.lamports += p.totalLamports;
      acc.recipients += p.recipientCount;
      return acc;
    },
    { lamports: 0n, recipients: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/explore" },
          {
            label: header.name,
            href: `/r/${header.ghOwner}/${header.ghRepo}`,
          },
          { label: "Payouts" },
        ]}
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Total payouts"
          value={allPayouts.length.toLocaleString("en-US")}
        />
        <SummaryTile
          label="Lifetime distributed"
          value={formatSol(totals.lamports, 4)}
          mono
        />
        <SummaryTile
          label="Recipients paid"
          value={totals.recipients.toLocaleString("en-US")}
        />
      </section>

      <Card depth="raised" padding="none" className="overflow-hidden">
        {pagePayouts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Coins className="size-10 text-fg-muted" aria-hidden />
            <div className="text-headline-sm text-fg">No payouts yet</div>
            <p className="max-w-md text-body-md text-fg-secondary">
              The first cycle lands at midnight UTC. Trading fees on{" "}
              <span className="text-mono-sm text-fg">
                {header.tokenMint
                  ? "the launched token"
                  : "this repo's token (once launched)"}
              </span>{" "}
              will be claimed and redistributed to the top-
              {header.payoutConfig.topN}.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_140px_60px] items-center gap-3 border-b border-border bg-surface-elevated/40 px-5 py-2.5 text-label-sm text-fg-muted">
              <div>When</div>
              <div className="text-right">Status</div>
              <div className="text-right">Recipients</div>
              <div className="text-right">Total</div>
              <div />
            </div>
            <ul className="divide-y divide-border">
              {pagePayouts.map((p) => (
                <PayoutRow key={p.id} payout={p} />
              ))}
            </ul>
          </>
        )}
      </Card>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between text-body-sm text-fg-secondary">
          <Button
            asChild
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-40" : ""}
          >
            <Link
              href={`/r/${header.ghOwner}/${header.ghRepo}/payouts?page=${page - 1}`}
            >
              ← Newer
            </Link>
          </Button>
          <span className="text-caption text-fg-muted">
            Page {page}
            {hasMore ? "" : " · end"}
          </span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            disabled={!hasMore}
            className={!hasMore ? "pointer-events-none opacity-40" : ""}
          >
            <Link
              href={`/r/${header.ghOwner}/${header.ghRepo}/payouts?page=${page + 1}`}
            >
              Older →
            </Link>
          </Button>
        </div>
      )}
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

function PayoutRow({
  payout,
}: {
  payout: {
    id: string;
    executedAt: Date | null;
    status: string;
    totalLamports: bigint;
    recipientCount: number;
    claimSignature: string | null;
  };
}) {
  const when = payout.executedAt
    ? formatRelativeTime(payout.executedAt)
    : "Pending";
  const statusVariant = (() => {
    switch (payout.status) {
      case "completed":
        return { variant: "success" as const, label: "Completed", dot: true };
      case "distributing":
      case "claiming":
        return { variant: "warning" as const, label: payout.status, dot: true };
      case "failed":
        return { variant: "danger" as const, label: "Failed", dot: false };
      case "cancelled":
        return { variant: "default" as const, label: "Cancelled", dot: false };
      case "simulated":
        return { variant: "default" as const, label: "Not Live", dot: false };
      default:
        return {
          variant: "default" as const,
          label: payout.status,
          dot: false,
        };
    }
  })();

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_120px_120px_140px_60px] items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-elevated/40">
      <div className="min-w-0">
        <div className="text-body-md text-fg">{when}</div>
        {payout.executedAt ? (
          <div className="text-caption text-fg-muted">
            {payout.executedAt.toISOString().slice(0, 19).replace("T", " ")} UTC
          </div>
        ) : null}
      </div>
      <div className="text-right">
        <Badge
          variant={statusVariant.variant}
          dot={statusVariant.dot}
          size="sm"
        >
          {statusVariant.label}
        </Badge>
      </div>
      <div className="text-right text-mono-md text-fg">
        {payout.recipientCount.toLocaleString("en-US")}
      </div>
      <div className="text-right text-mono-md text-fg">
        {formatSol(payout.totalLamports, 4)}
      </div>
      <div className="text-right">
        {payout.claimSignature ? (
          <span className="inline-flex items-center gap-0.5">
            <CopyButton
              value={payout.claimSignature}
              label="Copy transaction signature"
            />
            <Link
              href={solscanTxUrl(payout.claimSignature)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`View transaction ${formatAddress(payout.claimSignature)} on Solscan`}
              className="gb-control gb-control-icon gb-control-ghost inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-fg"
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          </span>
        ) : (
          <span className="inline-block size-7" aria-hidden />
        )}
      </div>
    </li>
  );
}
