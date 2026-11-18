import { Suspense } from "react";
import { SidebarProvider } from "@repo/ui";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { getDefaultSidebarCollapsed } from "@/lib/sidebar-state";
import { ConsoleFrameLoading } from "@/components/sidebar/ConsoleLoading";

/**
 * `/dashboard/**` shell. Wraps every dashboard route in a SidebarProvider
 * so per-page sidebars share collapse state.
 *
 * Auth re-validation (CVE-2025-29927 mitigation): proxy.ts already redirects
 * unauthenticated users away from `/dashboard/*`, but we re-check the session
 * here so a forged `x-middleware-subrequest` header cannot bypass the gate.
 *
 * The route-group layouts below this boundary own their persistent chrome.
 * This root layout stays minimal so the account shell and per-project shell
 * do not nest inside each other.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ConsoleFrameLoading title="Dashboard" />}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [defaultSidebarCollapsed] = await Promise.all([
    getDefaultSidebarCollapsed(),
    hasCredentials.db() ? requireAuthSession("/dashboard") : null,
  ]);

  return (
    <SidebarProvider defaultCollapsed={defaultSidebarCollapsed}>
      {children}
    </SidebarProvider>
  );
}
