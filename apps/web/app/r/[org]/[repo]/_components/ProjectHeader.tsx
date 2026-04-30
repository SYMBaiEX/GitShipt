import { Github } from "@repo/ui";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { TokenActionsMenu } from "./TokenActionsMenu";
import type { ProjectHeader as ProjectHeaderType } from "@/lib/queries/project-page";

/**
 * Project hero — floats directly on the page bg (no card wrapper).
 * Just avatar + name + GitHub link + description. The TokenStatsRow lives
 * in its own grid row in page.tsx so this component stays short and the
 * overall row 1 height doesn't crowd the bottom row.
 */
export function ProjectHeader({ header }: { header: ProjectHeaderType }) {
  const avatar = header.imageUrl ?? `https://github.com/${header.ghOwner}.png`;
  const repoUrl = `https://github.com/${header.ghOwner}/${header.ghRepo}`;
  const ticker = header.tokenMint
    ? header.ghRepo.toUpperCase().slice(0, 8)
    : null;

  return (
    <header className="flex min-w-0 items-center gap-4 sm:gap-5 lg:gap-6">
      <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-elevated ring-1 ring-border sm:size-24 lg:size-28">
        <Image
          src={avatar}
          alt=""
          fill
          sizes="(max-width: 640px) 80px, (max-width: 1024px) 96px, 112px"
          className="object-cover"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="truncate text-headline-lg text-fg">
            {header.name}
          </h1>
          <Link
            href={repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${header.ghOwner}/${header.ghRepo} on GitHub`}
            className="inline-flex items-center gap-1 text-body-md text-fg-secondary transition-colors hover:text-fg"
          >
            <Github className="size-4 lg:size-5" />
            {header.ghOwner}/{header.ghRepo}
            <ExternalLink className="size-3.5 lg:size-4" />
          </Link>
        </div>
        {ticker ? (
          <div className="mt-1 text-body-sm text-fg-secondary">
            Ticker:{" "}
            <span className="text-mono-md text-fg">
              ${ticker}
            </span>
          </div>
        ) : null}
        {header.description ? (
          <p className="mt-1.5 line-clamp-2 text-body-md text-fg-secondary lg:mt-2">
            {header.description}
          </p>
        ) : null}
      </div>
      <TokenActionsMenu
        tokenMint={header.tokenMint}
        ghOwner={header.ghOwner}
        ghRepo={header.ghRepo}
        className="shrink-0 self-start"
      />
    </header>
  );
}
