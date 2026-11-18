import { Card, Skeleton } from "@repo/ui";

export function ExploreResultsLoading() {
  return (
    <>
      <span role="status" className="sr-only">
        Loading projects
      </span>
      <Skeleton className="h-4 w-20" />
      <div
        aria-hidden
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Card
            key={index}
            depth="flat"
            padding="default"
            className="flex min-h-44 flex-col gap-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-10" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-4 w-5/6" />
            <div className="mt-auto grid grid-cols-3 gap-2">
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
              <Skeleton className="h-7" />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
