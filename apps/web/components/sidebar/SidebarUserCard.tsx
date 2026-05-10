"use client";

import { Github } from "@repo/ui";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronUp, LayoutDashboard, LogOut, Settings, User as UserIcon } from "lucide-react";
import { useSidebar } from "@repo/ui";
import { useRouter } from "next/navigation";
import { cn } from "@repo/lib";
import { authClient } from "@/lib/auth/client";
import { resetClientStateForLogout } from "@/lib/state/logout";

export interface SidebarUserCardProps {
  /** Stable authenticated user id. Used as a signed-in signal. */
  id?: string | null;
  /**
   * Display name fallback chain: `name` → `email` local-part → "Account".
   */
  name?: string | null;
  email?: string | null;
  /** GitHub handle without leading `@`. */
  username?: string | null;
  /** Profile image URL — typically the GitHub avatar. */
  imageUrl?: string | null;
  defaultDashboardHref?: string | null;
}

/**
 * Signed-in user card for the sidebar footer.
 *
 * Layout:
 *
 *  ┌─────────────────────────────┐
 *  │ [avatar] Display Name    ⌄  │
 *  │           @gh-username      │
 *  └─────────────────────────────┘
 *
 * Click toggles a small popover (Profile / My dashboard / Settings /
 * Sign out). Hand-rolled dropdown matching the `TokenActionsMenu` pattern
 * — no Radix dep, click-outside + Escape close.
 *
 * When the desktop sidebar is collapsed (icon rail), the card collapses to
 * just the avatar; the popover still works. When no session identity is
 * present, renders nothing.
 */
export function SidebarUserCard({
  id,
  name,
  email,
  username,
  imageUrl,
  defaultDashboardHref,
}: SidebarUserCardProps) {
  const { collapsed, closeMobile } = useSidebar();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isSigningOut, startSignOutTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!id && !name && !email && !username && !imageUrl) return null;

  const displayName =
    name ?? username ?? (email ? email.split("@")[0] : null) ?? "Account";
  const handle = username ? `@${username}` : (email ?? null);
  const initial = (displayName.trim().charAt(0) || "?").toUpperCase();
  const publicProfileHref = username ? `/u/${username}` : "/dashboard";
  const dashboardHref = defaultDashboardHref ?? "/dashboard";

  function signOut() {
    setOpen(false);
    closeMobile();
    resetClientStateForLogout();

    startSignOutTransition(() => {
      void (async () => {
        try {
          const result = await authClient.signOut();
          if ("error" in result && result.error) {
            throw result.error;
          }
        } catch {
          // Keep the optimistic signed-out chrome and refresh server state below.
          // If the cookie was already invalid, this still lands on public UI.
        } finally {
          router.replace("/");
          router.refresh();
        }
      })();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          collapsed
            ? `${displayName}${handle ? ` · ${handle}` : ""}`
            : undefined
        }
        className={cn(
          "gb-control group flex w-full items-center gap-2.5 rounded-md",
          "border",
          "px-2 py-1.5 text-left",
          "transition-[background-color,border-color,box-shadow,color,transform]",
          open
            ? "gb-control-secondary border-border/50 bg-surface-elevated"
            : "gb-control-ghost border-transparent hover:border-border/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        <Avatar imageUrl={imageUrl} initial={initial} alt={displayName} />
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col leading-tight",
            collapsed && "lg:hidden",
          )}
        >
          <span className="truncate text-label-sm text-fg">{displayName}</span>
          {handle ? (
            <span className="truncate text-caption text-fg-muted">
              {handle}
            </span>
          ) : null}
        </div>
        <ChevronUp
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-fg-muted transition-transform duration-200",
            open ? "rotate-0" : "rotate-180",
            collapsed && "lg:hidden",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-0 right-0 z-30 mb-2",
            "min-w-[200px]",
            "rounded-lg border border-border-strong",
            "glass-strong shadow-popover",
            "py-1",
            // When collapsed (icon rail), pin the popover to the right of
            // the rail so it doesn't get clipped.
            collapsed &&
              "lg:left-full lg:right-auto lg:bottom-0 lg:ml-2 lg:mb-0",
          )}
        >
          <MenuLink
            href="/dashboard/profile"
            icon={UserIcon}
            label="Profile"
            onSelect={() => setOpen(false)}
          />
          {username ? (
            <MenuLink
              href={publicProfileHref}
              icon={Github}
              label="Public profile"
              onSelect={() => setOpen(false)}
            />
          ) : null}
          <MenuLink
            href={dashboardHref}
            icon={LayoutDashboard}
            label="My dashboard"
            onSelect={() => setOpen(false)}
          />
          <MenuLink
            href="/dashboard/settings"
            icon={Settings}
            label="Settings"
            onSelect={() => setOpen(false)}
          />
          <Divider />
          <button
            type="button"
            role="menuitem"
            disabled={isSigningOut}
            onClick={signOut}
            className={cn(
              "gb-menu-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
              "text-body-sm text-fg-secondary",
              "transition-[background-color,box-shadow,color] hover:bg-surface-elevated hover:text-danger",
              "focus-visible:outline-none focus-visible:bg-surface-elevated focus-visible:text-danger",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">
              {isSigningOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({
  imageUrl,
  initial,
  alt,
}: {
  imageUrl?: string | null;
  initial: string;
  alt: string;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={alt}
        width={28}
        height={28}
        className="size-7 shrink-0 rounded-md border border-border/50 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-elevated text-label-sm text-fg-secondary"
    >
      {initial}
    </span>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onSelect,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "gb-menu-item flex items-center gap-2.5 rounded-md px-2.5 py-1.5",
        "text-body-sm text-fg-secondary",
        "transition-[background-color,box-shadow,color] hover:bg-surface-elevated hover:text-fg",
        "focus-visible:outline-none focus-visible:bg-surface-elevated focus-visible:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border/60" aria-hidden />;
}
