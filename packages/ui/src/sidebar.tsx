"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@repo/lib";
import { createUiStore, useUiStoreValue, type UiStore } from "./ui-store";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

/**
 * Sidebar primitive — shadcn-composable, macOS Tahoe / Liquid Glass aesthetic.
 *
 * Composition:
 *   <SidebarProvider>
 *     <Sidebar>
 *       <SidebarHeader>...</SidebarHeader>
 *       <SidebarContent>
 *         <SidebarSection title="Project">
 *           <SidebarItem icon={Home} href="/" label="Overview" />
 *         </SidebarSection>
 *       </SidebarContent>
 *       <SidebarFooter>...</SidebarFooter>
 *     </Sidebar>
 *     <main>{children}</main>
 *   </SidebarProvider>
 *
 * State:
 *  - `collapsed` — desktop (lg+) collapse to a 68px icon rail. Persisted to
 *    localStorage["gitshipt:sidebar:collapsed"] after mount.
 *  - `mobileOpen` — controls the slide-over drawer on small (< lg) viewports.
 *    Defaults to false; opened by `<MobileSidebarTrigger>` outside the sidebar
 *    (rendered in each app shell). Closes on backdrop click, Escape, or any
 *    `<SidebarItem>` click (so navigating dismisses the drawer).
 */

const STORAGE_KEY = "gitshipt:sidebar:collapsed";
const SIDEBAR_COLLAPSED_COOKIE = "gitshipt_sidebar_collapsed";

function persistCollapsedPreference(v: boolean) {
  const value = v ? "1" : "0";
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage may be unavailable in some browser contexts.
  }
  try {
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Cookies may be unavailable in some embedded/browser contexts.
  }
}

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  // Mobile drawer
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  closeMobile: () => void;
  toggleMobile: () => void;
};

const SidebarContext = React.createContext<UiStore | null>(null);

export function useSidebar(): SidebarContextValue {
  const store = React.useContext(SidebarContext);
  if (!store) {
    throw new Error("useSidebar must be used inside <SidebarProvider>");
  }

  const collapsed = useUiStoreValue(store, (state) => state.sidebar.collapsed);
  const mobileOpen = useUiStoreValue(
    store,
    (state) => state.sidebar.mobileOpen,
  );
  const setSidebarCollapsed = useUiStoreValue(
    store,
    (state) => state.setSidebarCollapsed,
  );
  const setMobileOpen = useUiStoreValue(
    store,
    (state) => state.setSidebarMobileOpen,
  );
  const closeMobile = useUiStoreValue(
    store,
    (state) => state.closeSidebarMobile,
  );
  const toggleMobile = useUiStoreValue(
    store,
    (state) => state.toggleSidebarMobile,
  );

  const setCollapsed = React.useCallback(
    (v: boolean) => {
      setSidebarCollapsed(v);
      persistCollapsedPreference(v);
    },
    [setSidebarCollapsed],
  );

  const toggle = React.useCallback(() => {
    const next = !store.getState().sidebar.collapsed;
    setSidebarCollapsed(next);
    persistCollapsedPreference(next);
  }, [setSidebarCollapsed, store]);

  return React.useMemo(
    () => ({
      collapsed,
      toggle,
      setCollapsed,
      mobileOpen,
      setMobileOpen,
      closeMobile,
      toggleMobile,
    }),
    [
      collapsed,
      toggle,
      setCollapsed,
      mobileOpen,
      setMobileOpen,
      closeMobile,
      toggleMobile,
    ],
  );
}

export function SidebarProvider({
  defaultCollapsed = false,
  children,
}: {
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const storeRef = React.useRef<UiStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createUiStore({ collapsed: defaultCollapsed });
  }
  const store = storeRef.current;
  const mobileOpen = useUiStoreValue(
    store,
    (state) => state.sidebar.mobileOpen,
  );
  const closeSidebarMobile = useUiStoreValue(
    store,
    (state) => state.closeSidebarMobile,
  );

  React.useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) closeSidebarMobile();
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [closeSidebarMobile, mobileOpen]);

  return (
    <SidebarContext.Provider value={store}>{children}</SidebarContext.Provider>
  );
}

// ----------------------------------------------------------------------------
// Sidebar shell
// ----------------------------------------------------------------------------

export function Sidebar({
  className,
  children,
  "aria-label": ariaLabel = "App navigation",
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  return (
    <>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="gb-navigation-sheet gap-0 lg:hidden [&_[data-sidebar-header]]:pr-16"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = document.querySelector<HTMLElement>(
              "[data-mobile-nav-trigger]",
            );
            const target = trigger?.getClientRects().length
              ? trigger
              : document.getElementById("main-content");
            target?.focus({ preventScroll: true });
          }}
        >
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
      <aside
        data-gitshipt-sidebar="true"
        data-collapsed={collapsed ? "true" : "false"}
        aria-label={ariaLabel}
        className={cn(
          "hidden h-full shrink-0 flex-col motion-safe:transition-[width] lg:flex",
          collapsed ? "lg:w-[68px]" : "lg:w-[260px]",

          // Surface
          "rounded-2xl",
          "glass shadow-floating surface-highlight",
          "border border-border/50",
          "overflow-hidden",
          className,
        )}
        {...props}
      >
        {!mobileOpen ? children : null}
      </aside>
    </>
  );
}

// ----------------------------------------------------------------------------
// Header / Content / Footer regions
// ----------------------------------------------------------------------------

export function SidebarHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar-header
      className={cn(
        "flex h-14 items-center gap-2 px-3 shrink-0",
        "border-b border-border/40",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden px-2 py-3",
        "[scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent]",
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  );
}

export function SidebarFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border/40 bg-bg/30",
        collapsed ? "lg:px-2 lg:py-2" : "lg:px-3 lg:py-3",
        // On mobile the drawer is always at expanded padding.
        "px-3 py-3",
        "space-y-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sections + items
// ----------------------------------------------------------------------------

export function SidebarSection({
  title,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title?: string }) {
  const { collapsed } = useSidebar();
  return (
    <div className={cn("py-1.5", className)} {...props}>
      {title ? (
        <div
          className={cn(
            "px-2.5 pb-1.5 text-caption uppercase text-fg-muted",
            // Hide the title only when desktop-collapsed; mobile drawer always
            // renders at full width.
            collapsed && "lg:hidden",
          )}
        >
          {title}
        </div>
      ) : null}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  href?: string;
  active?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Keep the item rendered when collapsed (default: true). Useful to hide admin-only items. */
  show?: boolean;
  /** External link — opens in new tab with rel=noreferrer. */
  external?: boolean;
}

export function SidebarItem({
  icon: Icon,
  label,
  href,
  active,
  badge,
  onClick,
  disabled,
  show = true,
  external,
}: SidebarItemProps) {
  const { collapsed, closeMobile } = useSidebar();
  if (!show) return null;

  const inner = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "truncate text-label-md",
          // Hide label only when desktop-collapsed; the mobile drawer is
          // always at full width.
          collapsed && "lg:sr-only",
        )}
      >
        {label}
      </span>
      {badge ? (
        <span className={cn("ml-auto shrink-0", collapsed && "lg:hidden")}>
          {badge}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    "group flex h-11 items-center gap-3 rounded-md border px-2.5 lg:h-9",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    active
      ? "gb-control gb-control-secondary border-border-strong bg-surface-elevated text-fg"
      : "gb-route-link gb-route-link-inactive text-fg-secondary hover:text-fg",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    disabled && "pointer-events-none opacity-40",
    collapsed && "lg:justify-center lg:px-0",
  );

  const handleClick = () => {
    onClick?.();
    closeMobile();
  };

  if (href && !disabled) {
    if (external) {
      return (
        <a
          href={href}
          aria-current={active ? "page" : undefined}
          target="_blank"
          rel="noreferrer noopener"
          className={className}
          title={collapsed ? label : undefined}
          onClick={handleClick}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={className}
        title={collapsed ? label : undefined}
        onNavigate={handleClick}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(className, "w-full text-left")}
      title={collapsed ? label : undefined}
    >
      {inner}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Collapse toggle
// ----------------------------------------------------------------------------

export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      // Hide the desktop collapse toggle on mobile — the drawer is opened/closed
      // by the hamburger trigger or backdrop, not by this affordance.
      className={cn(
        "gb-control gb-control-icon gb-control-ghost hidden h-8 w-8 items-center justify-center rounded-md lg:inline-flex",
        "text-fg-secondary hover:text-fg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        collapsed && "lg:mx-auto",
        className,
      )}
    >
      {collapsed ? (
        <ChevronRight className="size-4" />
      ) : (
        <ChevronLeft className="size-4" />
      )}
    </button>
  );
}

/**
 * Convenience: a horizontal divider that respects the sidebar's hairline style.
 */
export function SidebarDivider({ className }: { className?: string }) {
  return <div className={cn("my-2 h-px bg-border/40", className)} />;
}
