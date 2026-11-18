import { Skeleton } from "@repo/ui";
import { ExploreResultsLoading } from "./_components/ExploreResultsLoading";

/**
 * Streaming skeleton for /explore. Mirrors the page shape:
 *   - Header strip: title + lede
 *   - Search/filter bar
 *   - 3-col grid of project cards (avatar + meta + body + 3 stat pills)
 */
export default function ExploreLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="text-headline-lg">Explore projects</h1>
      <Skeleton className="h-[52px] w-full rounded-md" />
      <ExploreResultsLoading />
    </div>
  );
}
