import Link from "next/link";
import { Trophy } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui";
import { Badge } from "@repo/ui";
import { formatScore, formatSol } from "@repo/lib";
import type { ContributorProfileProjectRow } from "@/lib/queries/discovery";

/**
 * Projects this contributor has scored on, sorted by lifetime earnings.
 * Each row links to the project page so the visitor can drop straight
 * into the leaderboard. Wallet-link state is surfaced as a useful nudge toward
 * Bags-native claiming.
 */
export function ProjectsContributedTo({
  rows,
  username,
}: {
  rows: ContributorProfileProjectRow[];
  username: string;
}) {
  return (
    <Card depth="raised" padding="default">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="mt-4">
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={`${row.projectId}:${row.slug}`}>
                <Link
                  href={`/r/${row.slug}?from=u/${username}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-elevated"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-md text-fg">
                        {row.name}
                      </span>
                      {!row.isWalletLinked ? (
                        <Badge variant="warning" size="sm">
                          Unlinked
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-mono-sm text-fg-muted">
                      {row.slug}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-right">
                    <div>
                      <div className="text-caption text-fg-muted">Rank</div>
                      <div className="text-mono-md text-fg">
                        {row.rank > 0 ? `#${row.rank}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption text-fg-muted">Score</div>
                      <div className="text-mono-md text-fg">
                        {formatScore(row.score)}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption text-fg-muted">Earned</div>
                      <div className="text-mono-md text-fg">
                        {formatSol(row.lifetimeLamports, 2)}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Trophy className="size-10 text-fg-muted" aria-hidden />
      <p className="text-body-md text-fg-secondary">
        No projects yet — link a wallet on a leaderboard you&apos;re on to start
        earning.
      </p>
    </div>
  );
}
