import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { Badge } from "@repo/ui";
import { Card } from "@repo/ui";
import { formatSol } from "@repo/lib";
import type { LandingProject } from "@/lib/queries/global";

/**
 * Curated grid of the top live projects, headlined on the landing. Each
 * card is a `<Link>` and uses `Card depth="raised"` so the section reads
 * as the page's primary anchor below the hero strip.
 *
 * Inline `TopProjectCard` keeps this section self-contained — when Agent A
 * lands a richer ProjectCard in `components/discovery/`, swap the import
 * and delete the local definition.
 */
export function TopProjectsGrid({ projects }: { projects: LandingProject[] }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-headline-md text-fg">Top projects on GitShipt</h2>
          <p className="text-body-md text-fg-secondary">
            Live repos with the most swap fees flowing to contributors right
            now.
          </p>
        </div>
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-label-md text-fg-secondary transition-colors hover:text-fg"
        >
          View all
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card depth="flat" padding="lg" className="text-center">
          <p className="text-body-md text-fg-secondary">
            No live projects yet — be the first to launch.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <TopProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Inline project card. Mirrors the project page's visual language without
 * pulling in any of the heavier project-page primitives.
 */
function TopProjectCard({ project }: { project: LandingProject }) {
  const avatar =
    project.imageUrl ?? `https://github.com/${project.ghOwner}.png`;
  return (
    <Link href={`/r/${project.slug}?from=home`} className="group block">
      <Card
        depth="raised"
        padding="sm"
        className="flex h-full flex-col gap-3 transition-colors group-hover:border-border-strong"
      >
        <div className="flex items-center gap-2.5">
          <Image
            src={avatar}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg bg-surface-elevated"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-label-md font-semibold text-fg">
                {project.name}
              </h3>
              <Badge
                variant="success"
                size="sm"
                dot
                aria-label={`Status ${
                  project.status === "simulated_live"
                    ? "Not Live"
                    : project.status
                }`}
              >
                {project.status === "simulated_live"
                  ? "Not Live"
                  : project.status}
              </Badge>
            </div>
            <p className="truncate text-caption text-fg-muted">
              {project.slug}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-2.5">
          <Stat
            label="Lifetime"
            value={formatSol(project.lifetimeFeesLamports, 2)}
          />
          <Stat label="Daily" value={formatSol(project.dailyFeeLamports, 2)} />
          <Stat
            label="Devs"
            icon={<Users className="size-3" aria-hidden />}
            value={project.contributorsCount.toLocaleString("en-US")}
          />
        </div>
      </Card>
    </Link>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
        {icon}
        {label}
      </span>
      <span className="truncate text-mono-sm text-fg">{value}</span>
    </div>
  );
}
