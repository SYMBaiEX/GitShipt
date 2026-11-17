"use client";

import Link from "next/link";
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

  return (
    <nav
      aria-label="Quick navigation"
      className="gb-mobile-dock grid auto-cols-fr grid-flow-col gap-1 border-t border-border bg-surface lg:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const current = path?.toLowerCase() === href.toLowerCase();
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "gb-mobile-tab gb-route-link flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-label-sm",
              current
                ? "bg-primary-soft font-semibold text-primary-readable"
                : "text-fg-secondary hover:text-fg",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
