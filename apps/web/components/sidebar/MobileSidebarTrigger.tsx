"use client";

import { Menu, X } from "lucide-react";
import { useSidebar } from "@repo/ui";
import { cn } from "@repo/lib";

/**
 * Mobile-only hamburger button that toggles the sidebar drawer.
 *
 * Lives in the persistent mobile header, inside a SidebarProvider.
 */
export function MobileSidebarTrigger({ className }: { className?: string }) {
  const { mobileOpen, toggleMobile } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleMobile}
      aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
      aria-haspopup="dialog"
      data-mobile-nav-trigger
      aria-expanded={mobileOpen}
      className={cn(
        "lg:hidden",
        "gb-control gb-control-icon gb-control-secondary inline-flex size-11 items-center justify-center rounded-md",
        "shrink-0 border border-border/60",
        "text-fg-secondary hover:text-fg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      {mobileOpen ? (
        <X aria-hidden className="size-4" />
      ) : (
        <Menu aria-hidden className="size-4" />
      )}
    </button>
  );
}
