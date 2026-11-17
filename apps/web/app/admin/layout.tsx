import { Suspense } from "react";
import { notFound } from "next/navigation";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { SidebarProvider } from "@repo/ui";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { AppFrame } from "@/components/sidebar/AppFrame";
import { getDefaultSidebarCollapsed } from "@/lib/sidebar-state";
import { clusterLabel } from "@/lib/solana/explorer";

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
    <Suspense fallback={null}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
async function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  if (!hasCredentials.db()) {
    notFound();
  }

  const session = await requireAuthSession("/admin");

  const ok = await hasPermission("admin.access", { userId: session.user.id });
  if (!ok) {
    notFound();
  }
  const defaultSidebarCollapsed = await getDefaultSidebarCollapsed();

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
