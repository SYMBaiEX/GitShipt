import Link from "next/link";
import Image from "next/image";
import { Trophy, ArrowUpRight } from "lucide-react";
import { Card } from "@repo/ui";
import { formatSol } from "@repo/lib";
import type { GlobalLeaderboardEntry } from "@/lib/queries/global";

/**
 * Compact "Top earners" card for the landing bento. Shows top N
 * contributors (default 5) by lifetime SOL across all projects.
 * Click → /u/[username]. Footer link → /leaderboard for the full view.
 */
export function TopEarnersBento({
  entries,
  limit = 5,
}: {
  entries: GlobalLeaderboardEntry[];
  limit?: number;
}) {
  const top = entries.slice(0, limit);
  return (
    <Card
      depth="raised"
      padding="none"
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-fg-secondary" aria-hidden />
          <h3 className="text-headline-sm leading-none text-fg">Top earners</h3>
        </div>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-label-sm text-fg-secondary transition-colors hover:text-fg"
        >
          View all
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="px-4 py-10 text-center text-body-sm text-fg-muted">
          No earners yet. The first leaderboard cycle starts at midnight UTC.
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-border">
          {top.map((entry) => (
            <li key={`${entry.ghUsername}-${entry.rank}`}>
              <Link
                href={`/u/${entry.ghUsername}`}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-elevated/40"
              >
                <span
                  className={
                    entry.rank === 1
                      ? "grid size-6 place-items-center rounded-md bg-rank-gold text-bg text-mono-sm font-medium"
                      : entry.rank === 2
                        ? "grid size-6 place-items-center rounded-md bg-rank-silver text-bg text-mono-sm font-medium"
                        : entry.rank === 3
                          ? "grid size-6 place-items-center rounded-md bg-rank-bronze text-bg text-mono-sm font-medium"
                          : "grid size-6 place-items-center text-mono-sm text-fg-muted"
                  }
                >
                  {entry.rank}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <Image
                    src={entry.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    sizes="28px"
                    className="size-7 shrink-0 rounded-lg border border-border bg-surface-elevated object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-body-sm text-fg">
                      {entry.ghUsername}
                    </div>
                    <div className="truncate text-caption text-fg-muted">
                      {entry.activeProjectsCount} project
                      {entry.activeProjectsCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className="text-mono-sm text-fg">
                  {formatSol(entry.totalLifetimeLamports, 3)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
