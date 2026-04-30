import { ArrowUpRight } from "lucide-react";
import { formatSol, formatUsd, lamportsSeriesToSol } from "@repo/lib";
import { Badge } from "@repo/ui";
import { PoolSparkline } from "./PoolSparkline";
import type { PoolOverview, ProjectHeader } from "@/lib/queries/project-page";

/**
 * The page hero — the single primary accent element on the screen.
 * Display-size SOL value uses `text-primary-readable`, and the sparkline below uses
 * `var(--chart-1)` which is the same brand accent. We deliberately avoid pairing
 * any other primary accent element (button, pill) on the same fold to keep the
 * one-primary-per-viewport rule intact.
 */
export function PoolOverviewCard({
  pool,
  projectStatus,
}: {
  pool: PoolOverview;
  projectStatus: ProjectHeader["status"];
}) {
  const sparklineData = lamportsSeriesToSol(pool.sparkline);
  const feeSharePct = (pool.feeShareBps / 100).toFixed(0);
  const isSimulated = pool.isStub || projectStatus === "simulated_live";
  const stateLabel = isSimulated ? "Not Live" : "Live fees";
  const stateDescription = isSimulated
    ? "Bags credentials are not live here; amounts are deterministic estimates."
    : "Fetched from Bags fee data; daily pool is a lifetime average.";

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-label-sm text-fg-muted">Daily Fee Pool</h2>
          <div className="mt-0.5 max-w-[24rem] text-caption text-fg-secondary">
            {stateDescription}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={isSimulated ? "warning" : "success"} size="sm" dot>
            {stateLabel}
          </Badge>
          <span className="inline-flex items-center rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-label-sm text-fg-secondary">
            Fee Share:{" "}
            <span className="ml-1 text-mono-sm text-fg">{feeSharePct}%</span>
          </span>
        </div>
      </div>

      <div>
        <div className="text-mono-display text-primary-readable">
          {formatSol(pool.dailyFeeLamports, 2)}
        </div>
        <div className="mt-1 text-mono-sm text-fg-muted">
          {formatUsd(pool.dailyFeeUsd)}
        </div>
      </div>

      <PoolSparkline data={sparklineData} />

      <div className="flex items-center justify-between text-caption text-fg-muted">
        <span>Source: Trading Fees</span>
        <span className="text-mono-sm">
          Lifetime {formatSol(pool.lifetimeLamports, 2)}
        </span>
      </div>

      {pool.bagsUrl ? (
        <a
          href={pool.bagsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="gb-control gb-control-secondary inline-flex items-center justify-between rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-label-md text-fg"
        >
          View on Bags.fm
          <ArrowUpRight className="size-4 text-fg-secondary" />
        </a>
      ) : null}
    </section>
  );
}
