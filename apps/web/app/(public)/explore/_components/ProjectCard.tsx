import { Github } from "@repo/ui";
import Link from "next/link";
import Image from "next/image";
import { Coins, Users } from "lucide-react";
import { Card } from "@repo/ui";
import { Badge } from "@repo/ui";
import { formatSol } from "@repo/lib";
import { cn } from "@repo/lib";
import type { PublicProjectRow } from "@/lib/queries/discovery";

/**
 * Discovery tile in the /explore grid — pump.fun / bags.fm style.
 *
 * Layout (top to bottom):
 *  - Header row: avatar (56) + name/slug + status badge
 *  - Description (clamp-2)
 *  - Token mint chip (mono, truncated) + age chip
 *  - Stat strip (Lifetime / 24h fee / Devs) — mono values, hairline divider above
 *
 * Whole card is a link to /r/{slug}; raised → floating shadow on hover.
 */
export function ProjectCard({ project }: { project: PublicProjectRow }) {
  const initial = project.name.slice(0, 1).toUpperCase();
  return (
    <Link
      href={`/r/${project.slug}?from=explore`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <Card
        depth="raised"
        padding="default"
        className={cn(
          "flex h-full flex-col gap-3 transition-[box-shadow,border-color,transform] duration-200",
          "group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-floating",
        )}
      >
        <header className="flex items-start gap-3">
          <Avatar imageUrl={project.imageUrl} fallback={initial} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-headline-sm leading-tight text-fg">
              {project.name}
            </h2>
            <div className="mt-1 inline-flex items-center gap-1.5 text-mono-sm text-fg-muted">
              <Github className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{project.slug}</span>
            </div>
          </div>
          <StatusBadge status={project.status} />
        </header>

        <p className="line-clamp-2 min-h-[34px] text-body-sm text-fg-secondary">
          {project.description ?? "No description provided."}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {project.tokenMint ? (
            <Chip>
              <span className="text-fg-muted">CA</span>
              <span className="text-mono-sm text-fg-secondary">
                {shortenMint(project.tokenMint)}
              </span>
            </Chip>
          ) : null}
          <Chip>
            <span className="text-fg-muted">Age</span>
            <span className="text-mono-sm text-fg-secondary">
              {timeAgo(project.createdAt)}
            </span>
          </Chip>
        </div>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
          <Stat label="Lifetime" icon={<Coins className="size-3" />}>
            <span className="text-mono-md text-fg">
              {formatSol(project.lifetimeFeesLamports, 2)}
            </span>
          </Stat>
          <Stat label="Daily">
            <span className="text-mono-md text-fg">
              {formatSol(project.dailyFeeLamports, 2)}
            </span>
          </Stat>
          <Stat label="Devs" icon={<Users className="size-3" />}>
            <span className="text-mono-md text-fg">
              {project.contributorsCount.toLocaleString("en-US")}
            </span>
          </Stat>
        </dl>
      </Card>
    </Link>
  );
}

function Avatar({
  imageUrl,
  fallback,
}: {
  imageUrl: string | null;
  fallback: string;
}) {
  if (imageUrl) {
    return (
      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border/60">
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-14 shrink-0 place-items-center rounded-xl border border-border/60 bg-primary-soft text-headline-sm font-semibold text-primary-readable"
    >
      {fallback}
    </span>
  );
}

function StatusBadge({ status }: { status: PublicProjectRow["status"] }) {
  if (status === "live") {
    return (
      <Badge variant="success" size="sm" dot>
        Live
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge variant="warning" size="sm">
        Paused
      </Badge>
    );
  }
  if (status === "killed") {
    return (
      <Badge variant="danger" size="sm">
        Killed
      </Badge>
    );
  }
  if (status === "launch_configured") {
    return (
      <Badge variant="warning" size="sm">
        Configured
      </Badge>
    );
  }
  if (status === "simulated_live") {
    return (
      <Badge variant="warning" size="sm">
        Not Live
      </Badge>
    );
  }
  if (status === "tracked") {
    return (
      <Badge variant="default" size="sm">
        Tracked
      </Badge>
    );
  }
  return (
    <Badge variant="default" size="sm">
      Draft
    </Badge>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-bg/40 px-2 py-0.5 text-caption">
      {children}
    </span>
  );
}

function Stat({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="inline-flex items-center gap-1 text-caption text-fg-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function shortenMint(mint: string): string {
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}
