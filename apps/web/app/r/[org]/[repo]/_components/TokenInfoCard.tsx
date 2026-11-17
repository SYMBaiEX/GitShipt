import Link from "next/link";
import { ArrowUpRight, Coins, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@repo/ui";
import { cn } from "@repo/lib";
import { formatAddress, formatSol } from "@repo/lib";
import { CopyButton } from "@/components/shared";
import type { TokenStats } from "@/lib/queries/token-stats";
import { solscanTokenUrl } from "@/lib/solana/explorer";

/**
 * Token info — sits in the top-right grid cell next to ProjectHeader.
 * Renders price + delta + a 2×2 stats grid (mkt cap / 24h vol / holders /
 * lifetime fees) + contract address row with copy + Solscan link.
 *
 * When no token has been launched yet, renders an empty-state CTA.
 */
export function TokenInfoCard({
  stats,
  ghOwner,
  ghRepo,
}: {
  stats: TokenStats | null;
  ghOwner: string;
  ghRepo: string;
}) {
  if (!stats) {
    return (
      <Card depth="raised" padding="default" className="flex h-full flex-col">
        <div className="text-label-sm text-fg-muted">Token</div>
        <div className="mt-1 text-headline-sm text-fg-secondary">
          No token launched
        </div>
        <p className="mt-2 flex-1 text-body-sm text-fg-muted">
          {ghOwner}/{ghRepo} does not have a Bags.fm token yet.
        </p>
        <Link
          href="/launch"
          className="gb-control gb-control-primary mt-3 inline-flex h-9 items-center justify-center rounded-md border border-primary bg-primary px-4 text-label-md text-primary-fg"
        >
          Launch token
        </Link>
      </Card>
    );
  }

  const isUp = stats.priceChange24hPct >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <Card
      depth="raised"
      padding="none"
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-fg shadow-card-elevated">
            <Coins className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-label-md text-fg">{stats.symbol}</div>
            <div className="truncate text-caption text-fg-muted">
              BAGS Token
            </div>
          </div>
        </div>
        {stats.isStub ? (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-caption text-fg-muted">
            stub
          </span>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-mono-lg text-fg">
            ${stats.priceUsd.toFixed(stats.priceUsd < 0.01 ? 6 : 4)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-label-sm",
              isUp ? "text-success" : "text-danger",
            )}
          >
            <TrendIcon className="size-3" />
            {isUp ? "+" : ""}
            {stats.priceChange24hPct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <Stat label="Market Cap" value={formatUsdCompact(stats.marketCapUsd)} />
        <Stat label="24h Volume" value={formatUsdCompact(stats.volume24hUsd)} />
        <Stat label="Holders" value={stats.holders.toLocaleString("en-US")} />
        <Stat
          label="Lifetime Fees"
          value={formatSol(stats.lifetimeFeesLamports, 2)}
        />
      </div>

      <div className="flex items-center gap-1 border-t border-border bg-surface-elevated/40 px-3 py-2">
        <span className="shrink-0 text-caption text-fg-muted">Contract</span>
        <span
          className="ml-auto truncate text-mono-sm text-fg"
          title={stats.tokenMint}
        >
          {formatAddress(stats.tokenMint, 4, 4)}
        </span>
        <CopyButton value={stats.tokenMint} label="Copy contract address" />
        <Link
          href={solscanTokenUrl(stats.tokenMint)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View on Solscan"
          className="gb-control gb-control-icon gb-control-ghost inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-fg"
        >
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-0.5 truncate text-mono-md text-fg">{value}</div>
    </div>
  );
}

/** USD compact: $4.2M, $124k, $0.42 — for stat cells. */
function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}
