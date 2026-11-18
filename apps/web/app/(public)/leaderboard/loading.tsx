import { Card } from "@repo/ui";
import { Skeleton } from "@repo/ui";

/**
 * Streaming skeleton for /leaderboard. Mirrors the page shape:
 *   - Header strip: title + lede
 *   - Tabs row
 *   - Ranked table: header + 10 rows (rank, contributor, score, weight)
 */
export default function LeaderboardLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-headline-lg">Global leaderboard</h1>
      <LeaderboardLoadingBody />
    </div>
  );
}

export function LeaderboardLoadingBody() {
  return (
    <>
      <span role="status" className="sr-only">Loading rankings</span>
      <div aria-hidden className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      <Card depth="flat" padding="none" className="overflow-hidden">
        <div className="grid grid-cols-[40px_1fr_120px_120px] gap-3 border-b border-border px-4 py-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3" />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[40px_1fr_120px_120px] items-center gap-3 border-b border-border px-4 py-4 last:border-b-0"
          >
            <Skeleton shape="circle" className="size-8 rounded-lg" />
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-8" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-4" />
            <Skeleton className="h-4" />
          </div>
        ))}
      </Card>
    </>
  );
}
