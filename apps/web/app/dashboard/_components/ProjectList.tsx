import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { Badge } from "@repo/ui";
import { formatSol } from "@repo/lib";
import type { MyProjectRow } from "@/lib/queries/dashboard";

export function ProjectList({ rows }: { rows: MyProjectRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((p) => (
        <li key={p.id}>
          <Link
            href={`/dashboard/projects/${p.id}`}
            className="group grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 px-6 py-4 transition-colors hover:bg-surface-elevated/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Avatar src={p.imageUrl} alt={p.slug} />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-label-md text-fg">{p.name}</span>
                <StatusBadge status={p.status} />
              </div>
              <div className="text-mono-sm text-fg-muted truncate">
                {p.slug}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
                <span>
                  <span className="text-mono-sm text-fg-secondary">
                    {p.contributorsCount}
                  </span>{" "}
                  ranked
                </span>
                <span>
                  <span className="text-mono-sm text-fg">
                    {formatSol(p.lifetimeFeesLamports, 4)}
                  </span>{" "}
                  lifetime
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <span className="inline-flex items-center gap-1 text-label-sm text-fg-muted transition-colors group-hover:text-fg">
                Open console <ExternalLink className="size-3.5" />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Avatar({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <span className="grid size-10 place-items-center rounded-full bg-surface-elevated text-label-sm text-fg-muted">
        {alt.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={40}
      height={40}
      sizes="40px"
      className="size-10 rounded-full border border-border object-cover"
    />
  );
}

export function StatusBadge({
  status,
}: {
  status:
    | "draft"
    | "launch_configured"
    | "live"
    | "paused"
    | "killed"
    | "simulated_live";
}) {
  const map = {
    live: { variant: "success" as const, label: "Live", dot: true },
    launch_configured: {
      variant: "warning" as const,
      label: "Configured",
      dot: false,
    },
    draft: { variant: "default" as const, label: "Draft", dot: false },
    paused: { variant: "warning" as const, label: "Paused", dot: false },
    killed: { variant: "danger" as const, label: "Killed", dot: false },
    simulated_live: {
      variant: "default" as const,
      label: "Not Live",
      dot: false,
    },
  } as const;
  const v = map[status];
  return (
    <Badge variant={v.variant} size="sm" dot={v.dot}>
      {v.label}
    </Badge>
  );
}
