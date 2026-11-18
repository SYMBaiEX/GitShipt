import { Card, Skeleton } from "@repo/ui";

export function ConsoleLoading({
  label,
  tiles = 3,
}: {
  label: string;
  tiles?: number;
}) {
  return (
    <>
      <span role="status" className="sr-only">
        Loading {label}
      </span>
      <div aria-hidden className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: tiles }, (_, index) => (
          <Card
            key={index}
            depth="flat"
            padding="default"
            className="space-y-3"
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
          </Card>
        ))}
      </div>
    </>
  );
}

export function ConsoleFrameLoading({ title }: { title: string }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh w-full max-w-content space-y-4 px-4 py-6"
    >
      <p className="text-headline-md">{title}</p>
      <ConsoleLoading label={title} />
    </main>
  );
}
