import { Trophy } from "lucide-react";
import { rewardModeOf } from "@repo/shared";
import { ContributorRow } from "./ContributorRow";
import { LeaderboardTooltipScope } from "./LeaderboardTooltipScope";
import { HowScoringWorksModal } from "./HowScoringWorksModal";
import { formatSol } from "@repo/lib";
import { Card } from "@repo/ui";
import type { LeaderboardRow } from "@/lib/queries/project-page";
import type { ScoringConfig, PayoutConfig } from "@/db/schema";

/**
 * Leaderboard component — single floating card with three regions:
 *   1. Header (icon + title + scoring info modal trigger)
 *   2. Sticky column header (Rank | Contributor | Score | % | Earnings)
 *   3. Scrollable list of contributor rows (max-h-96, internal scroll)
 *   4. Footer with the daily pool total
 *
 * The list scrolls independently of the page so the header + footer stay
 * pinned while the user explores ranks. The card uses Card depth=raised
 * so it pops off the bg without competing with the Pool hero.
 */
export function LeaderboardTable({
  rows,
  dailyFeeLamports,
  dailyFeeUsd,
  scoringConfig,
  payoutConfig,
}: {
  rows: LeaderboardRow[];
  dailyFeeLamports: bigint;
  dailyFeeUsd: number | null;
  scoringConfig: ScoringConfig;
  payoutConfig: PayoutConfig;
}) {
  if (rewardModeOf(payoutConfig) === "owner") {
    return (
      <Card depth="raised" padding="default" className="min-h-0 overflow-auto">
        <h2 className="text-headline-sm">Contributor rankings</h2>
        <p className="mt-1 text-body-sm text-fg-secondary">
          Informational only; rankings do not determine owner rewards.
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-body-sm text-fg-muted">
            No contributors ranked yet.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.contributorId}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0 truncate text-body-sm">
                  {row.rank}. {row.ghUsername}
                </span>
                <span className="text-mono-sm">{row.score}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    );
  }
  return (
    <Card
      depth="raised"
      padding="none"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:px-6 lg:py-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Trophy className="size-5 text-fg-secondary" aria-hidden />
          <h2 className="text-headline-md leading-none text-fg">Leaderboard</h2>
          <span className="hidden items-center gap-1.5 text-body-sm text-fg-muted sm:inline-flex">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-success" />
            Updates daily 00:00 UTC
          </span>
        </div>
        <HowScoringWorksModal
          scoringConfig={scoringConfig}
          payoutConfig={payoutConfig}
        />
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-border px-5 py-12 text-center text-body-md text-fg-secondary">
          No contributors ranked yet — the first snapshot lands at midnight UTC.
        </div>
      ) : (
        <div
          role="table"
          aria-label="Contributor rankings"
          aria-rowcount={rows.length + 1}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div role="rowgroup">
            <div
              role="row"
              className="grid grid-cols-[48px_minmax(0,1fr)_92px_80px_140px] items-center gap-3 border-y border-border bg-surface-elevated/40 px-5 py-2.5 text-label-sm text-fg-muted lg:px-6"
            >
              <div role="columnheader">#</div>
              <div role="columnheader">Contributor</div>
              <div role="columnheader" className="text-right">
                Score
              </div>
              <div role="columnheader" className="text-right">
                % Pool
              </div>
              <div role="columnheader" className="text-right">
                Earnings
              </div>
            </div>
          </div>

          <div
            role="rowgroup"
            className="min-h-0 max-h-[520px] flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent] lg:max-h-none"
            aria-label="Contributor rankings, scrollable"
          >
            <LeaderboardTooltipScope>
              {rows.map((row) => (
                <ContributorRow
                  key={row.contributorId}
                  row={row}
                  dailyFeeLamports={dailyFeeLamports}
                  dailyFeeUsd={dailyFeeUsd}
                />
              ))}
            </LeaderboardTooltipScope>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border bg-surface-elevated/40 px-5 py-3 lg:px-6">
        <span className="text-label-md text-fg-muted">Daily pool</span>
        <span className="text-mono-md text-fg">
          {formatSol(dailyFeeLamports)}
        </span>
      </div>
    </Card>
  );
}
