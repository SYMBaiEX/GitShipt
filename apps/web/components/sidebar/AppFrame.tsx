import { Github, Twitter } from "@repo/ui";
import Link from "next/link";
import { cn } from "@repo/lib";
import { MobileSidebarTrigger } from "./MobileSidebarTrigger";
import { MobileDock, type MobileDockSurface } from "./MobileDock";
import { RouteViewport } from "./RouteViewport";

export function AppFrame({
  sidebar,
  surface,
  title,
  footer,
  contentClassName,
  children,
}: {
  sidebar: React.ReactNode;
  surface: MobileDockSurface;
  title?: string;
  footer: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gb-app-frame flex overflow-hidden bg-bg text-fg">
      <div className="contents lg:block lg:shrink-0 lg:p-3 lg:pr-0">
        {sidebar}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="gb-mobile-header flex shrink-0 items-center gap-3 border-b border-border bg-surface shadow-card-elevated lg:hidden">
          <MobileSidebarTrigger />
          <Link
            href="/"
            aria-label="GitShipt home"
            className="gb-route-link flex min-h-11 shrink-0 items-center rounded-md px-1 text-label-md font-semibold"
          >
            GitShipt
          </Link>
          {title && title !== "GitShipt" ? (
            <span className="ml-auto min-w-0 truncate text-right text-label-sm text-fg-secondary">
              {title}
            </span>
          ) : null}
        </header>
        <RouteViewport
          className={cn(
            "gb-app-content min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 outline-none lg:pb-3",
            contentClassName,
          )}
        >
          {children}
        </RouteViewport>
        <MobileDock surface={surface} />
        <footer className="glass surface-highlight ml-3 hidden shrink-0 items-center justify-between gap-3 rounded-tl-2xl border-t border-l border-border/60 px-4 py-1.5 shadow-card-elevated lg:flex">
          <span className="truncate text-caption text-fg-muted">{footer}</span>
          <div className="flex items-center gap-1">
            <SocialLink
              href={
                typeof surface === "object"
                  ? surface.repoUrl
                  : "https://github.com/SYMBaiEX/gitshipt"
              }
              label="GitHub repository"
            >
              <Github className="size-4" aria-hidden />
            </SocialLink>
            <SocialLink href="https://x.com/GitShipt" label="GitShipt on X">
              <Twitter className="size-4" aria-hidden />
            </SocialLink>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="gb-control gb-control-icon gb-control-ghost inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:text-fg"
    >
      {children}
    </a>
  );
}
