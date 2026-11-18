import { Suspense } from "react";
import { notFound } from "next/navigation";
import { hasCredentials } from "@/lib/env";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { SidebarProvider } from "@repo/ui";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { AppFrame } from "@/components/sidebar/AppFrame";
import { getDefaultSidebarCollapsed } from "@/lib/sidebar-state";
import { clusterLabel } from "@/lib/solana/explorer";
import { ConsoleFrameLoading } from "@/components/sidebar/ConsoleLoading";

/**
 * `/admin/**` shell. Mirrors the project-page app shell exactly so the visual
 * language is identical.
 *
 * The proxy redirect only improves the anonymous navigation flow. The
 * layout re-validates the session AND the `admin.access`
 * permission inside the route. Each page additionally re-checks its own
 * narrower permission (e.g. `admin.users.role.grant` on /admin/users).
 *
 * Stub mode (no DB) → 404 to keep the surface area off the public web.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ConsoleFrameLoading title="Admin console" />}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
async function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  if (!hasCredentials.db()) {
    notFound();
  }

  const [defaultSidebarCollapsed] = await Promise.all([
    getDefaultSidebarCollapsed(),
    requireAdminPage(),
  ]);

  return (
    <SidebarProvider defaultCollapsed={defaultSidebarCollapsed}>
      <AppFrame
        surface="admin"
        title="Admin"
        sidebar={<AppSidebar surface={{ kind: "admin" }} />}
        footer={`Admin · ${clusterLabel()} · BAGS.fm`}
      >
        {children}
      </AppFrame>
    </SidebarProvider>
  );
}
