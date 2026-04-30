import Image from "next/image";
import Link from "next/link";
import { RankMedal } from "@/components/shared";
import { formatPercent, formatSol, formatUsd } from "@repo/lib";
import type { LeaderboardRow } from "@/lib/queries/project-page";
import { ScoreBreakdownCell } from "./ScoreBreakdownCell";

/**
 * Single leaderboard row. Renders as a `<Link>` so the entire row is one
 * navigation target (`/u/{ghUsername}`). All numeric cells use mono utilities
 * for tabular alignment; only the contributor name uses sans body type.
 *
 * Earnings = pool share allocated to this rank, derived from `weight` and the
 * project's daily pool. We compute per-row to avoid round-trip math in the
 * parent and keep this component drop-in for snapshot tests.
 */
export function ContributorRow({
  row,
  dailyFeeLamports,
  dailyFeeUsd,
}: {
  row: LeaderboardRow;
  dailyFeeLamports: bigint;
  dailyFeeUsd: number | null;
}) {
  // Multiply lamports by weight (0..1) using a 1e9 fixed-point intermediate so
  // we don't drag in BigDecimal. Acceptable: weights are tier constants from
  // payoutConfig.tierWeights and never exceed ~0.4 with 6+ decimals.
  const weightScaled = BigInt(Math.round(row.weight * 1_000_000_000));
  const earnedLamports = (dailyFeeLamports * weightScaled) / 1_000_000_000n;
  const earnedUsd = dailyFeeUsd != null ? dailyFeeUsd * row.weight : null;

  const displayName = row.ghUsername;
  const avatar = row.avatarUrl ?? `https://github.com/${row.ghUsername}.png`;

  return (
    <Link
      href={`/u/${row.ghUsername}`}
      role="row"
      aria-label={`Rank ${row.rank} ${row.ghUsername}`}
      className="grid grid-cols-[56px_minmax(0,1fr)_96px_88px_140px] items-center gap-4 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div role="cell" className="flex items-center">
        <RankMedal rank={row.rank} />
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <span className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
          <Image
            src={avatar}
            alt=""
            fill
            sizes="32px"
            className="object-cover"
          />
        </span>
        <div className="min-w-0">
          <div className="truncate text-body-md text-fg">{displayName}</div>
          <div className="truncate text-body-sm text-fg-muted">
            @{row.ghUsername}
          </div>
        </div>
      </div>
      <div role="cell" className="text-right text-mono-md text-fg">
        <ScoreBreakdownCell score={row.score} inputs={row.inputs} />
      </div>
      <div role="cell" className="text-right text-mono-md text-fg">
        {formatPercent(row.weightPercent)}
      </div>
      <div role="cell" className="text-right">
        <div className="text-mono-md text-fg">{formatSol(earnedLamports)}</div>
        <div className="text-mono-sm text-fg-muted">
          {formatUsd(earnedUsd)}
        </div>
      </div>
    </Link>
  );
}
