import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProjectShell } from "./_components/ProjectShell";
import { getProjectShellChrome } from "@/lib/auth/project-chrome";
import { getProjectShellIdentity } from "@/lib/queries/project-page";
import { getDefaultSidebarCollapsed } from "@/lib/sidebar-state";

type Params = Promise<{ org: string; repo: string }>;

/**
 * Owns the project chrome for every public repo route.
 *
 * Auth is resolved once for the route segment and passed to the sidebar as
 * stable chrome data; every mutating action still revalidates permissions
 * independently.
 */
export default function PublicProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  return (
    <Suspense fallback={null}>
      <PublicProjectLayoutContent params={params}>
        {children}
      </PublicProjectLayoutContent>
    </Suspense>
  );
}

async function PublicProjectLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { org, repo } = await params;
  const header = await getProjectShellIdentity(org, repo);
  if (!header) notFound();

  const [{ canAdmin }, defaultSidebarCollapsed] = await Promise.all([
    getProjectShellChrome(header.id),
    getDefaultSidebarCollapsed(),
  ]);

  return (
    <ProjectShell
      header={header}
      canAdmin={canAdmin}
      defaultSidebarCollapsed={defaultSidebarCollapsed}
    >
      {children}
    </ProjectShell>
  );
}
