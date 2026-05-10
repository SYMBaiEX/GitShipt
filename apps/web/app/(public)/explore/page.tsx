import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@repo/ui";
import { Card } from "@repo/ui";
import {
  getAllPublicProjects,
  type ExploreFilters,
} from "@/lib/queries/discovery";
import { ExploreFilters as FiltersBar } from "./_components/ExploreFilters";
import { ProjectCard } from "./_components/ProjectCard";

export const metadata: Metadata = {
  title: "Explore projects",
  description:
    "Open-source repos routing token fees to contributors through Bags-native fee sharing.",
};

type SearchParams = Promise<{
  status?: string;
  sort?: string;
  q?: string;
}>;

function parseFilters(raw: Awaited<SearchParams>): ExploreFilters {
  const status =
    raw.status === "live" ||
    raw.status === "paused" ||
    raw.status === "tracked" ||
    raw.status === "all"
      ? raw.status
      : "all";
  const sort =
    raw.sort === "lifetime" ||
    raw.sort === "contributors" ||
    raw.sort === "newest" ||
    raw.sort === "trending"
      ? raw.sort
      : "trending";
  return {
    status,
    sort,
    search: raw.q ?? undefined,
  };
}

export default function ExplorePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <ExplorePageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExplorePageContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const projects = await getAllPublicProjects(filters);
  const hasFilters = Boolean(params.q || params.status || params.sort);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="sr-only">Explore projects</h1>
      <FiltersBar />

      <div className="flex items-center justify-between">
        <span className="text-caption text-fg-muted">
          {projects.length === 0
            ? "0 projects"
            : projects.length === 1
              ? "1 project"
              : `${projects.length.toLocaleString("en-US")} projects`}
        </span>
      </div>

      {projects.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card
      depth="raised"
      padding="lg"
      className="mx-auto flex max-w-md flex-col items-center gap-3 text-center"
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary-readable"
      >
        <Compass className="size-6" />
      </span>
      <h2 className="text-headline-sm text-fg">No projects match</h2>
      <p className="text-body-md text-fg-secondary">
        {hasFilters
          ? "Try a different filter or clear your search to see every live project."
          : "No projects are live yet — be the first to launch one."}
      </p>
      <div className="mt-2">
        {hasFilters ? (
          <Button asChild variant="primary" size="default">
            <Link href="/explore">Clear filters</Link>
          </Button>
        ) : (
          <Button asChild variant="primary" size="default">
            <Link href="/launch">Launch a project</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
