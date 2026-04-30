import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { Card } from "@repo/ui";
import { formatSol } from "@repo/lib";
import { RankMedal } from "@/components/shared";
import type {
  GlobalLeaderboardEntry,
  GlobalProjectEntry,
} from "@/lib/queries/global";

/**
 * Cross-project leaderboard rendered inside a single raised card with a
 * sticky column header and an internally scrollable body. Two modes share
 * the same shell so the toggle on the page can swap content without
 * rebuilding the chrome.
 */
export function GlobalLeaderboardTable(
  props:
    | {
        mode: "contributor";
        rows: GlobalLeaderboardEntry[];
        emptyMessage?: string;
      }
    | { mode: "project"; rows: GlobalProjectEntry[]; emptyMessage?: string },
) {
  const { mode } = props;
  const empty = props.rows.length === 0;

  return (
    <Card
      depth="raised"
      padding="none"
      className="flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-5 py-4 lg:px-6 lg:py-5">
        <Trophy className="size-5 text-fg-secondary" aria-hidden />
        <h2 className="text-headline-md leading-none text-fg">
          {mode === "contributor" ? "Top contributors" : "Top projects"}
        </h2>
        <span className="hidden items-center gap-1.5 text-body-sm text-fg-muted sm:inline-flex">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-success" />
          Updated each payout cycle
        </span>
      </div>

      {empty ? (
        <div className="border-t border-border px-5 py-12 text-center text-body-md text-fg-secondary">
          {props.emptyMessage ??
            "No payouts have been confirmed yet — once the first cycle clears, contributors will appear here."}
        </div>
      ) : mode === "contributor" ? (
        <ContributorList rows={props.rows} />
      ) : (
        <ProjectList rows={props.rows} />
      )}
    </Card>
  );
}

function ContributorList({ rows }: { rows: GlobalLeaderboardEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        role="table"
        aria-label="Global contributor rankings"
        aria-rowcount={rows.length + 1}
        className="min-w-[760px]"
      >
        <div role="rowgroup">
          <div
            role="row"
            className="grid grid-cols-[56px_minmax(0,1fr)_140px_88px_minmax(0,200px)] items-center gap-3 border-y border-border bg-surface-elevated/40 px-5 py-2.5 text-label-sm text-fg-muted lg:px-6"
          >
            <div role="columnheader">#</div>
            <div role="columnheader">Contributor</div>
            <div role="columnheader" className="text-right">
              Lifetime SOL
            </div>
            <div role="columnheader" className="text-right">
              Projects
            </div>
            <div role="columnheader" className="truncate">
              Top project
            </div>
          </div>
        </div>

        <div
          role="rowgroup"
          className="max-h-[640px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]"
          aria-label="Global contributor rankings, scrollable"
        >
          {rows.map((row) => (
            <div
              key={row.ghUsername}
              role="row"
              className="grid grid-cols-[56px_minmax(0,1fr)_140px_88px_minmax(0,200px)] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 hover:bg-surface-elevated lg:px-6"
            >
              <div role="cell" className="flex items-center">
                <RankMedal rank={row.rank} />
              </div>
              <Link
                href={`/u/${row.ghUsername}`}
                role="cell"
                className="flex min-w-0 items-center gap-3 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Image
                  src={row.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-lg bg-surface-elevated"
                />
                <div className="min-w-0">
                  <div className="truncate text-body-md text-fg">
                    {row.ghUsername}
                  </div>
                  <div className="truncate text-body-sm text-fg-muted">
                    @{row.ghUsername}
                  </div>
                </div>
              </Link>
              <div role="cell" className="text-right text-mono-md text-fg">
                {formatSol(row.totalLifetimeLamports)}
              </div>
              <div
                role="cell"
                className="text-right text-mono-sm text-fg-muted"
              >
                {row.activeProjectsCount}
              </div>
              <div role="cell" className="min-w-0">
                {row.topProjectSlug ? (
                  <Link
                    href={`/r/${row.topProjectSlug}?from=leaderboard`}
                    className="block truncate text-body-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:underline"
                  >
                    {row.topProjectSlug}
                  </Link>
                ) : (
                  <span className="text-body-sm text-fg-muted">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectList({ rows }: { rows: GlobalProjectEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        role="table"
        aria-label="Global project rankings"
        aria-rowcount={rows.length + 1}
        className="min-w-[720px]"
      >
        <div role="rowgroup">
          <div
            role="row"
            className="grid grid-cols-[56px_minmax(0,1fr)_140px_120px_120px] items-center gap-3 border-y border-border bg-surface-elevated/40 px-5 py-2.5 text-label-sm text-fg-muted lg:px-6"
          >
            <div role="columnheader">#</div>
            <div role="columnheader">Project</div>
            <div role="columnheader" className="text-right">
              Lifetime fees
            </div>
            <div role="columnheader" className="text-right">
              Contributors
            </div>
            <div role="columnheader" className="text-right">
              Daily pool
            </div>
          </div>
        </div>

        <div
          role="rowgroup"
          className="max-h-[640px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]"
          aria-label="Global project rankings, scrollable"
        >
          {rows.map((row) => {
            const avatar =
              row.imageUrl ??
              `https://github.com/${row.slug.split("/")[0]}.png`;
            return (
              <Link
                key={row.id}
                href={`/r/${row.slug}?from=leaderboard`}
                role="row"
                aria-label={`Rank ${row.rank} ${row.name}`}
                className="grid grid-cols-[56px_minmax(0,1fr)_140px_120px_120px] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:px-6"
              >
                <div role="cell" className="flex items-center">
                  <RankMedal rank={row.rank} />
                </div>
                <div role="cell" className="flex min-w-0 items-center gap-3">
                  <Image
                    src={avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 shrink-0 rounded-lg bg-surface-elevated"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-body-md text-fg">
                      {row.name}
                    </div>
                    <div className="truncate text-body-sm text-fg-muted">
                      {row.slug}
                    </div>
                  </div>
                </div>
                <div role="cell" className="text-right text-mono-md text-fg">
                  {formatSol(row.lifetimeFeesLamports)}
                </div>
                <div
                  role="cell"
                  className="text-right text-mono-sm text-fg-muted"
                >
                  {row.contributorsPaid}
                </div>
                <div
                  role="cell"
                  className="text-right text-mono-sm text-fg-muted"
                >
                  {formatSol(row.dailyFeeLamports)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
