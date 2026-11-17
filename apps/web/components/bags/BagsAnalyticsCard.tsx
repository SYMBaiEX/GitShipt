import { Activity, ArrowUpRight } from "lucide-react";
import type {
  PoolOverview,
  RecentPayoutRow,
} from "@/lib/queries/project-page";
import type { TokenStats } from "@/lib/queries/token-stats";
import type { TokenClaimEvent } from "@/lib/bags/types";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { formatAddress, formatSol, formatUsd } from "@repo/lib";

export function BagsAnalyticsCard({
  stats,
  pool,
  recentPayouts,
  creatorCount,
  claimEvents,
}: {
  stats: TokenStats;
  pool: PoolOverview;
  recentPayouts: RecentPayoutRow[];
  creatorCount: number;
  claimEvents: TokenClaimEvent[];
}) {
  const lastClaim = claimEvents[0];
  const lastPayout = recentPayouts[0];
  const routeLabel =
    claimEvents.length > 0 ? "Live Bags claims" : "Payout ledger";

  return (
    <Card depth="raised" padding="default">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2">Bags analytics</CardTitle>
          </div>
          {stats.isStub || pool.isStub ? (
            <Badge variant="warning" size="sm">
              derived
            </Badge>
          ) : (
            <Badge variant="success" size="sm" dot>
              live
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Price" value={formatUsd(stats.priceUsd)} />
          <Metric label="24h volume" value={formatUsd(stats.volume24hUsd)} />
          <Metric
            label="Lifetime fees"
            value={formatSol(stats.lifetimeFeesLamports, 4)}
          />
          <Metric
            label="Creators"
            value={creatorCount.toLocaleString("en-US")}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
            <div className="flex items-center gap-2 text-label-sm text-fg">
              <Activity className="size-4 text-fg-muted" />
              {routeLabel}
            </div>
            <div className="mt-2 text-mono-md text-fg">
              {lastClaim?.amountLamports
                ? formatSol(lastClaim.amountLamports, 4)
                : lastPayout
                  ? formatSol(lastPayout.totalLamports, 4)
                  : "--"}
            </div>
            <div className="mt-1 text-mono-sm text-fg-muted">
              {lastClaim?.signature
                ? formatAddress(lastClaim.signature, 8, 6)
                : lastPayout?.claimSignature
                  ? formatAddress(lastPayout.claimSignature, 8, 6)
                  : "no claims yet"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface-elevated/40 p-3">
            <div className="text-label-sm text-fg">Contributor pool</div>
            <div className="mt-2 text-mono-md text-fg">
              {(pool.feeShareBps / 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-mono-sm text-fg-muted">
              daily {formatSol(pool.dailyFeeLamports, 4)}
            </div>
          </div>
        </div>

        {pool.bagsUrl ? (
          <a
            href={pool.bagsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-label-sm text-fg-secondary underline-offset-4 hover:text-fg hover:underline"
          >
            Bags.fm token page <ArrowUpRight className="size-3.5" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-surface/40 px-3 py-2.5">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-1 truncate text-mono-md text-fg">{value}</div>
    </div>
  );
}
