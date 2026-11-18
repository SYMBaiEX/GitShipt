"use client";

import { type CSSProperties } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Coins,
  Compass,
  FolderGit2,
  Home,
  Rocket,
  Trophy,
  Wallet,
} from "lucide-react";
import { Github } from "@repo/ui";
import { cn } from "@repo/lib";

export type MobileDockSurface =
  "public" | "dashboard" | "admin" | { projectPath: string; repoUrl: string };

export function MobileDock({ surface }: { surface: MobileDockSurface }) {
  const path = usePathname();
  const items =
    surface === "public"
      ? [
          { href: "/", label: "Home", icon: Home },
          { href: "/explore", label: "Explore", icon: Compass },
          { href: "/leaderboard", label: "Ranks", icon: Trophy },
          { href: "/launch", label: "Launch", icon: Rocket },
        ]
      : surface === "dashboard"
        ? [
            { href: "/dashboard", label: "Home", icon: Home },
            {
              href: "/dashboard/projects",
              label: "Projects",
              icon: FolderGit2,
            },
            { href: "/dashboard/wallets", label: "Wallets", icon: Wallet },
          ]
        : surface === "admin"
          ? [
              { href: "/admin", label: "Overview", icon: BarChart3 },
              { href: "/admin/projects", label: "Projects", icon: FolderGit2 },
              { href: "/admin/fees", label: "Fees", icon: Coins },
            ]
          : [
              { href: surface.projectPath, label: "Ranks", icon: Trophy },
              {
                href: surface.projectPath + "/token",
                label: "Token",
                icon: Coins,
              },
              {
                href: surface.projectPath + "/repository",
                label: "Repo",
                icon: Github,
              },
            ];

  const activeIndex = items.findIndex(
    ({ href }) => path?.toLowerCase() === href.toLowerCase(),
  );
  return (
    <nav
      aria-label="Quick navigation"
      className="gb-mobile-dock border-t border-border bg-surface lg:hidden"
    >
      <div
        className="relative isolate grid auto-cols-fr grid-flow-col gap-1"
        style={
          {
            "--dock-index": Math.max(0, activeIndex),
            "--dock-count": items.length,
          } as CSSProperties
        }
      >
        <span
          aria-hidden
          className="gb-dock-selection"
          data-active={activeIndex >= 0}
        />
        {items.map(({ href, label, icon: Icon }, index) => {
          const current = activeIndex === index;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              transitionTypes={
                activeIndex < 0 || current
                  ? undefined
                  : [index > activeIndex ? "dock-next" : "dock-prev"]
              }
              className={cn(
                "gb-mobile-tab gb-route-link relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-label-sm",
                current
                  ? "font-semibold text-primary-readable"
                  : "text-fg-secondary hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span>{label}</span>
              <DockPending />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DockPending() {
  const { pending } = useLinkStatus();
  return (
    <span className="gb-dock-pending" aria-hidden data-pending={pending} />
  );
}
