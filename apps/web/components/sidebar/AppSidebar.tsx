"use client";

import { Github } from "@repo/ui";
import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Coins,
  Compass,
  Eye,
  FileSearch,
  FileText,
  Flag,
  FlaskConical,
  FolderGit2,
  GitCompare,
  History,
  Home,
  KeyRound,
  Newspaper,
  Plug,
  Power,
  Rocket,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarDivider,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
  SidebarToggle,
  useSidebar,
} from "@repo/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@repo/ui";
import { SidebarUserCard } from "./SidebarUserCard";
import { useSessionChrome } from "@/components/auth/SessionChromeProvider";
import { resolveOrigin } from "@/lib/nav/origins";
import { useAuthenticatedRouteStore } from "@/lib/state/authenticated-route-store";
import { cn } from "@repo/lib";
import logo from "../../public/logo.png";

/**
 * Single sidebar component for every surface in the app.
 *
 * Consumers pass only primitives + a `surface` discriminator. The sidebar
 * owns its full visual catalog (icons, nav structure, brand defaults, return-to
 * logic) internally — that's what keeps the server→client boundary clean
 * (server pages pass JSON-serializable props; the client sidebar resolves
 * them to React components on its own).
 *
 * Example mounts:
 *
 *   // Visitor on a public page
 *   <AppSidebar surface={{ kind: 'public' }} />
 *
 *   // Signed-in chrome is resolved from SessionChromeProvider / authStore.
 *   <AppSidebar surface={{ kind: 'public' }} />
 *
 *   // Signed-in user on /dashboard/projects/[id]/*
 *   <AppSidebar
 *     surface={{
 *       kind: 'owner-project',
 *       projectId, projectName, slug,
 *     }}
 *   />
 *
 *   // Anyone on /r/[org]/[repo]/*
 *   <AppSidebar
 *     surface={{
 *       kind: 'public-project',
 *       projectId, projectName, slug, canAdmin,
 *     }}
 *   />
 *
 *   // Signed-in admin on /admin/*
 *   <AppSidebar surface={{ kind: 'admin' }} />
 */

export type AppSidebarSurface =
  | { kind: "public" }
  | {
      kind: "owner-project";
      projectId: string;
      projectName: string;
      slug: string;
    }
  | {
      kind: "public-project";
      projectId: string;
      projectName: string;
      slug: string;
      canAdmin?: boolean;
    }
  | { kind: "admin" };

export interface AppSidebarProps {
  /** What chrome to render. Discriminated union — see examples above. */
  surface: AppSidebarSurface;
  /** Optional extra slot rendered in the footer above the user card. */
  footerSlot?: React.ReactNode;
  /** Override the active item by key match instead of pathname. */
  activeKey?: string;
}

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  external?: boolean;
}
interface NavGroup {
  title?: string;
  items: NavItem[];
}

const LEGAL_LINKS = [
  { label: "Terms", href: "/legal/terms" },
  { label: "Privacy", href: "/legal/privacy" },
] as const;

// ─── Internal nav builders (client-side; icons imported above) ────────────

function publicGroup(): NavGroup {
  return {
    title: "Public",
    items: [
      { key: "home", label: "Home", icon: Home, href: "/" },
      { key: "explore", label: "Explore", icon: Compass, href: "/explore" },
      {
        key: "leaderboard",
        label: "Leaderboard",
        icon: Trophy,
        href: "/leaderboard",
      },
      { key: "launch", label: "Launch a token", icon: Rocket, href: "/launch" },
      { key: "docs", label: "Docs", icon: BookOpen, href: "/docs" },
    ],
  };
}

function accountGroup(): NavGroup {
  return {
    title: "Account",
    items: [
      { key: "dashboard", label: "Dashboard", icon: Home, href: "/dashboard" },
      {
        key: "profile",
        label: "Profile",
        icon: UserRound,
        href: "/dashboard/profile",
      },
      {
        key: "projects",
        label: "My projects",
        icon: FolderGit2,
        href: "/dashboard/projects",
      },
      {
        key: "earnings",
        label: "Earnings",
        icon: Coins,
        href: "/dashboard/earnings",
      },
      {
        key: "wallets",
        label: "Wallets",
        icon: Wallet,
        href: "/dashboard/wallets",
      },
      {
        key: "api-keys",
        label: "API keys",
        icon: KeyRound,
        href: "/dashboard/api-keys",
      },
      {
        key: "security",
        label: "Security",
        icon: KeyRound,
        href: "/dashboard/security",
      },
      {
        key: "settings",
        label: "Settings",
        icon: Settings,
        href: "/dashboard/settings",
      },
    ],
  };
}

function getStartedGroup(): NavGroup {
  return {
    title: "Get started",
    items: [
      { key: "signin", label: "Sign in", icon: Github, href: "/auth/signin" },
      { key: "launch", label: "Launch a token", icon: Rocket, href: "/launch" },
    ],
  };
}

function platformShortcutGroup(): NavGroup {
  return {
    title: "Platform",
    items: [
      {
        key: "admin",
        label: "Admin console",
        icon: ShieldAlert,
        href: "/admin",
      },
    ],
  };
}

function ownerProjectGroups(projectId: string, slug: string): NavGroup[] {
  const base = `/dashboard/projects/${projectId}`;
  return [
    {
      title: "Project",
      items: [
        { key: "overview", label: "Overview", icon: Home, href: base },
        {
          key: "leaderboard",
          label: "Leaderboard",
          icon: Trophy,
          href: `${base}/leaderboard`,
        },
        {
          key: "scoring",
          label: "Scoring",
          icon: BarChart3,
          href: `${base}/scoring`,
        },
        {
          key: "payouts",
          label: "Payouts",
          icon: Coins,
          href: `${base}/payouts`,
        },
        {
          key: "repository",
          label: "Repository",
          icon: Github,
          href: `${base}/repository`,
        },
        { key: "token", label: "Token", icon: Sparkles, href: `${base}/token` },
      ],
    },
    {
      title: "Manage",
      items: [
        {
          key: "settings",
          label: "Settings",
          icon: Settings,
          href: `${base}/settings`,
        },
        {
          key: "api-keys",
          label: "API keys",
          icon: KeyRound,
          href: `${base}/api-keys`,
        },
        { key: "team", label: "Team", icon: Users, href: `${base}/team` },
      ],
    },
    {
      title: "Resources",
      items: [
        { key: "docs", label: "Docs", icon: BookOpen, href: `${base}/docs` },
      ],
    },
    {
      title: "Public view",
      items: [
        {
          key: "public-leaderboard",
          label: "Public leaderboard",
          icon: Eye,
          href: `/r/${slug}`,
        },
        {
          key: "public-payouts",
          label: "Public payouts",
          icon: Coins,
          href: `/r/${slug}/payouts`,
        },
        {
          key: "public-snapshots",
          label: "Snapshots ledger",
          icon: History,
          href: `/r/${slug}/snapshots`,
        },
        {
          key: "public-token",
          label: "Public token page",
          icon: Sparkles,
          href: `/r/${slug}/token`,
        },
        {
          key: "public-repository",
          label: "Public repo page",
          icon: Github,
          href: `/r/${slug}/repository`,
        },
      ],
    },
  ];
}

function publicProjectGroups(
  slug: string,
  projectId: string,
  canAdmin: boolean,
): NavGroup[] {
  const base = `/r/${slug}`;
  const groups: NavGroup[] = [
    {
      title: "Project",
      items: [
        { key: "leaderboard", label: "Leaderboard", icon: Trophy, href: base },
        {
          key: "feed",
          label: "Feed",
          icon: Newspaper,
          href: `${base}/feed`,
        },
        {
          key: "payouts",
          label: "Payouts",
          icon: Coins,
          href: `${base}/payouts`,
        },
        {
          key: "snapshots",
          label: "Snapshots",
          icon: History,
          href: `${base}/snapshots`,
        },
        {
          key: "repository",
          label: "Repository",
          icon: Github,
          href: `${base}/repository`,
        },
        { key: "token", label: "Token", icon: Sparkles, href: `${base}/token` },
        { key: "docs", label: "Docs", icon: BookOpen, href: `${base}/docs` },
      ],
    },
  ];
  if (canAdmin) {
    const ownerBase = `/dashboard/projects/${projectId}`;
    groups.push({
      title: "Manage",
      items: [
        {
          key: "owner-overview",
          label: "Owner dashboard",
          icon: Sparkles,
          href: ownerBase,
        },
        {
          key: "owner-settings",
          label: "Settings",
          icon: Settings,
          href: `${ownerBase}/settings`,
        },
        {
          key: "owner-api-keys",
          label: "API keys",
          icon: KeyRound,
          href: `${ownerBase}/api-keys`,
        },
        {
          key: "owner-team",
          label: "Team",
          icon: Users,
          href: `${ownerBase}/team`,
        },
      ],
    });
  }
  return groups;
}

function adminGroups(): NavGroup[] {
  return [
    {
      title: "Ops",
      items: [
        { key: "overview", label: "Overview", icon: BarChart3, href: "/admin" },
        { key: "users", label: "Users", icon: Users, href: "/admin/users" },
        {
          key: "projects",
          label: "Projects",
          icon: FolderGit2,
          href: "/admin/projects",
        },
        {
          key: "reconciliation",
          label: "Reconciliation",
          icon: GitCompare,
          href: "/admin/projects/reconciliation",
        },
        {
          key: "payouts",
          label: "Payouts",
          icon: Coins,
          href: "/admin/payouts",
        },
        {
          key: "snapshots",
          label: "Snapshots",
          icon: History,
          href: "/admin/snapshots",
        },
      ],
    },
    {
      title: "Platform",
      items: [
        {
          key: "treasury",
          label: "Treasury",
          icon: Wallet,
          href: "/admin/treasury",
        },
        { key: "fees", label: "Fees", icon: Flag, href: "/admin/fees" },
        {
          key: "integrations",
          label: "Integrations",
          icon: Plug,
          href: "/admin/integrations",
        },
        {
          key: "feature-flags",
          label: "Feature flags",
          icon: FlaskConical,
          href: "/admin/feature-flags",
        },
        {
          key: "settings",
          label: "Settings",
          icon: Settings,
          href: "/admin/settings",
        },
      ],
    },
    {
      title: "Inspection",
      items: [
        {
          key: "workflows",
          label: "Workflows",
          icon: Workflow,
          href: "/admin/workflows",
        },
        {
          key: "audit",
          label: "Audit log",
          icon: FileSearch,
          href: "/admin/audit",
        },
        {
          key: "abuse",
          label: "Abuse review",
          icon: AlertTriangle,
          href: "/admin/abuse",
        },
        { key: "db", label: "DB sandbox", icon: FileText, href: "/admin/db" },
      ],
    },
    {
      title: "Maintenance",
      items: [
        {
          key: "maintenance",
          label: "Kill switch",
          icon: Power,
          href: "/admin/maintenance",
        },
      ],
    },
  ];
}

// ─── Surface → composition ────────────────────────────────────────────────

interface ResolvedComposition {
  brand: { title: string; subtitle?: string; href: string; logo?: boolean };
  returnTo: { label: string; href: string } | null;
  groups: NavGroup[];
}

function compose(
  surface: AppSidebarSurface,
  signedIn: boolean,
  isPlatformAdmin: boolean,
  fromOrigin: string | null,
): ResolvedComposition {
  switch (surface.kind) {
    case "public": {
      const groups: NavGroup[] = [publicGroup()];
      if (signedIn) groups.push(accountGroup());
      else groups.push(getStartedGroup());
      if (signedIn && isPlatformAdmin) groups.push(platformShortcutGroup());
      return {
        brand: {
          title: "GitShipt",
          subtitle: "by SYMBiEX & dEXploarer",
          href: "/",
          logo: true,
        },
        returnTo: null,
        groups,
      };
    }
    case "owner-project":
      return {
        brand: {
          title: surface.projectName,
          subtitle: surface.slug,
          href: "/dashboard",
        },
        returnTo: resolveOrigin(fromOrigin),
        groups: ownerProjectGroups(surface.projectId, surface.slug),
      };
    case "public-project":
      return {
        brand: {
          title: surface.projectName,
          subtitle: surface.slug,
          href: `/r/${surface.slug}`,
        },
        returnTo: resolveOrigin(fromOrigin),
        groups: publicProjectGroups(
          surface.slug,
          surface.projectId,
          Boolean(surface.canAdmin),
        ),
      };
    case "admin":
      return {
        brand: {
          title: "Admin console",
          subtitle: "GitShipt platform",
          href: "/admin",
        },
        returnTo: resolveOrigin(fromOrigin),
        groups: adminGroups(),
      };
  }
}

// ─── The component ────────────────────────────────────────────────────────

export function AppSidebar({
  surface,
  footerSlot,
  activeKey,
}: AppSidebarProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const fromOrigin = searchParams?.get("from") ?? null;
  const chromeUser = useSessionChrome();
  const { collapsed } = useSidebar();
  const setRouteChrome = useAuthenticatedRouteStore(
    (state) => state.setRouteChrome,
  );
  const resolvedUser = chromeUser;
  const resolvedIsPlatformAdmin = Boolean(chromeUser?.isPlatformAdmin);

  const signedIn = Boolean(
    resolvedUser &&
    (resolvedUser.name ||
      resolvedUser.id ||
      resolvedUser.email ||
      resolvedUser.username ||
      resolvedUser.imageUrl),
  );
  const { brand, returnTo, groups } = compose(
    surface,
    signedIn,
    resolvedIsPlatformAdmin,
    fromOrigin,
  );

  const resolvedActiveKey = React.useMemo(() => {
    if (activeKey !== undefined) return activeKey;

    let best: { key: string; href: string } | null = null;
    for (const group of groups) {
      for (const item of group.items) {
        const matches =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (!matches) continue;
        if (!best || item.href.length > best.href.length) {
          best = { key: item.key, href: item.href };
        }
      }
    }
    return best?.key ?? null;
  }, [activeKey, groups, pathname]);

  React.useEffect(() => {
    if (!signedIn && surface.kind === "public") return;
    setRouteChrome({
      pathname,
      surface: surface.kind,
      activeKey: resolvedActiveKey,
    });
  }, [pathname, resolvedActiveKey, setRouteChrome, signedIn, surface.kind]);

  const isItemActive = (key: string) => {
    return resolvedActiveKey === key;
  };

  const isLegalActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href={brand.href}
          className={cn(
            "flex min-w-0 items-center gap-2.5",
            collapsed && "lg:hidden",
          )}
        >
          {brand.logo ? <CollapsibleBrandLogo /> : null}
          <CollapsibleBrand title={brand.title} subtitle={brand.subtitle} />
        </Link>
        <SidebarToggle className={cn(!collapsed && "ml-auto")} />
      </SidebarHeader>

      <SidebarContent>
        {returnTo ? (
          <SidebarSection>
            <ReturnToLink href={returnTo.href} label={returnTo.label} />
          </SidebarSection>
        ) : null}

        {groups.map((group, gi) => (
          <React.Fragment key={`${group.title ?? "section"}-${gi}`}>
            {(returnTo || gi > 0) && <SidebarDivider />}
            <SidebarSection title={group.title}>
              {group.items.map((it) => (
                <SidebarItem
                  key={it.key}
                  icon={it.icon}
                  label={it.label}
                  href={it.href}
                  active={isItemActive(it.key)}
                  external={it.external}
                />
              ))}
            </SidebarSection>
          </React.Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <FooterLegalRow isActive={isLegalActive} />
        {footerSlot}
        {signedIn && resolvedUser ? (
          <SidebarUserCard
            id={resolvedUser.id ?? null}
            name={resolvedUser.name ?? null}
            email={resolvedUser.email ?? null}
            username={resolvedUser.username ?? null}
            imageUrl={resolvedUser.imageUrl ?? null}
            defaultDashboardHref={resolvedUser.defaultDashboardRoute ?? null}
          />
        ) : surface.kind === "public" ? (
          <CollapsibleSignInCta />
        ) : null}
        <SidebarFooterControls />
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function CollapsibleBrandLogo() {
  const { collapsed } = useSidebar();
  return (
    <Image
      src={logo}
      alt=""
      sizes="28px"
      className={cn("size-7 shrink-0 object-contain", collapsed && "lg:hidden")}
      loading="eager"
      fetchPriority="high"
      aria-hidden="true"
    />
  );
}

function ReturnToLink({ href, label }: { href: string; label: string }) {
  const { collapsed, closeMobile } = useSidebar();
  return (
    <Link
      href={href}
      onClick={closeMobile}
      title={collapsed ? `Return to ${label}` : undefined}
      className={cn(
        "gb-route-link gb-route-link-inactive group flex h-11 items-center gap-3 rounded-md border px-2.5 lg:h-9",
        "text-fg-secondary transition-[background-color,border-color,color,box-shadow] duration-150",
        "hover:text-fg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        collapsed && "lg:justify-center lg:px-0",
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      <span className={cn("truncate text-label-md", collapsed && "lg:sr-only")}>
        Return to {label}
      </span>
    </Link>
  );
}

function FooterLegalRow({ isActive }: { isActive: (href: string) => boolean }) {
  const { collapsed } = useSidebar();
  if (collapsed) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-1 text-caption text-fg-muted">
      {LEGAL_LINKS.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "transition-colors hover:text-fg",
            isActive(href) && "text-fg",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function CollapsibleSignInCta() {
  const { collapsed } = useSidebar();
  return (
    <Button
      asChild
      variant="primary"
      size="sm"
      className={cn("w-full text-primary-fg", collapsed && "lg:hidden")}
    >
      <Link href="/auth/signin">
        <Github className="size-4" /> Sign in with GitHub
      </Link>
    </Button>
  );
}

function CollapsibleBrand({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { collapsed } = useSidebar();
  return (
    <span
      className={cn(
        "flex flex-col leading-tight min-w-0",
        collapsed && "lg:hidden",
      )}
    >
      <span className="text-label-md text-fg truncate">{title}</span>
      {subtitle ? (
        <span className="text-caption text-fg-muted truncate">{subtitle}</span>
      ) : null}
    </span>
  );
}

function CollapsiblePoweredBy() {
  const { collapsed } = useSidebar();
  return (
    <span
      className={cn(
        "text-caption text-fg-muted truncate",
        collapsed && "lg:sr-only",
      )}
    >
      Powered by BAGS.fm
    </span>
  );
}

function SidebarFooterControls() {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        collapsed && "lg:justify-center",
      )}
    >
      <CollapsiblePoweredBy />
      <ThemeToggle className={cn(collapsed && "lg:mx-auto")} />
    </div>
  );
}
