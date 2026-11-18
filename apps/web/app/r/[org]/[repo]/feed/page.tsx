import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, Rss } from "lucide-react";
import { Button } from "@repo/ui";
import { Card } from "@repo/ui";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { getProjectBySlug } from "@/lib/queries/project-page";
import { getProjectFeed } from "@/lib/queries/project-feed";
import type { PeriodDigestSubjects } from "@/db/schema";
import { PeriodDigestCard } from "./_components/PeriodDigestCard";

type Params = Promise<{ org: string; repo: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { org, repo } = await params;
  const header = await getProjectBySlug(org, repo);
  if (!header) return { title: `${org}/${repo} · Feed` };
  return {
    title: `${header.name} · Feed`,
    description: `Daily digests + milestones for ${header.slug}. Synthesized from the leaderboard and git history.`,
    alternates: {
      types: {
        "application/atom+xml": `/r/${header.slug}/feed.atom`,
      },
    },
  };
}

export default function ProjectFeedPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ProjectFeedPageContent params={params} />
    </Suspense>
  );
}

async function ProjectFeedPageContent({ params }: { params: Params }) {
  const { org, repo } = await params;
  const header = await getProjectBySlug(org, repo);
  if (!header) notFound();

  const slug = `${header.ghOwner}/${header.ghRepo}`;
  const entries = await getProjectFeed(header.id, 50);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/explore" },
          { label: header.name, href: `/r/${slug}` },
          { label: "Feed" },
        ]}
      />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-md text-fg">Project feed</h1>
          <p className="text-body-sm text-fg-secondary">
            Period digests + milestones for {header.name}. Synthesized from the
            leaderboard and indexed git history.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`/r/${slug}/feed.atom`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Atom feed"
          >
            <Rss className="size-4" /> Atom
          </Link>
        </Button>
      </header>

      {entries.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((row) => {
            if (row.kind === "period_digest") {
              if (!isPeriodDigestSubjects(row.subjects)) {
                return (
                  <li key={row.id} id={`entry-${row.id}`}>
                    <FallbackMarkdownCard bodyMd={row.bodyMd} />
                  </li>
                );
              }

              return (
                <li key={row.id} id={`entry-${row.id}`}>
                  <PeriodDigestCard
                    subjects={row.subjects}
                    createdAt={row.createdAt}
                    pinned={row.pinned}
                  />
                </li>
              );
            }
            // Milestone kinds defined in schema but not yet emitted by writers
            // in v1. Falls back to the markdown body so the page never crashes
            // on a future kind that lands a row before its card component.
            return (
              <li key={row.id} id={`entry-${row.id}`}>
                <FallbackMarkdownCard bodyMd={row.bodyMd} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return (
    <Card
      depth="raised"
      padding="lg"
      className="flex flex-col items-center gap-3 text-center"
    >
      <Newspaper className="size-10 text-fg-muted" aria-hidden />
      <h2 className="text-headline-sm text-fg">No feed entries yet</h2>
      <p className="max-w-md text-body-md text-fg-secondary">
        The first card lands at the next snapshot. Period digests publish daily
        at 00:00 UTC; milestone cards publish when a new contributor lands their
        first ranked PR or a score threshold is crossed.
      </p>
    </Card>
  );
}

function FallbackMarkdownCard({ bodyMd }: { bodyMd: string }) {
  return (
    <Card depth="flat" padding="default">
      <pre className="whitespace-pre-wrap break-words text-body-sm text-fg-secondary">
        {bodyMd}
      </pre>
    </Card>
  );
}

function isPeriodDigestSubjects(value: unknown): value is PeriodDigestSubjects {
  if (typeof value !== "object" || value == null) return false;

  const subject = value as Record<string, unknown>;
  return (
    typeof subject.period === "string" &&
    typeof subject.snapshotId === "string" &&
    typeof subject.totals === "object" &&
    subject.totals != null &&
    Array.isArray(subject.topContributors)
  );
}
