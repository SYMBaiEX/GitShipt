import { Suspense } from "react";
import { notFound } from "next/navigation";
import { hasCredentials } from "@/lib/env";
import { hasPermission } from "@/lib/auth/permissions";
import { getProjectRecord } from "@/lib/queries/dashboard";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { AppShell } from "../../_components/AppShell";
import { requireAuthSession } from "@/lib/auth/session";
import { clusterLabel } from "@/lib/solana/explorer";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";

/**
 * Per-project gate. We re-validate the session here AND check
 * `project.read` so a signed-in stranger gets a 404, not a render of
 * someone else's project.
 *
 * The app shell lives here instead of inside each page so sibling route
 * navigation keeps the sidebar, footer, and provider state mounted. Pages
 * still re-check their own narrower permissions before reading data.
 */
export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProjectLayoutContent params={params}>{children}</ProjectLayoutContent>
    </Suspense>
  );
}

async function ProjectLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) {
    return (
      <AppShell
        sidebar={
          <AppSidebar
            surface={{
              kind: "owner-project",
              projectId: "",
              projectName: "Stub mode",
              slug: "db/offline",
            }}
          />
        }
      >
        {children}
      </AppShell>
    );
  }

  const { id } = await params;
  const session = await requireAuthSession(`/dashboard/projects/${id}`);

  const project = await getProjectRecord(id);
  if (!project) notFound();

  const canRead = await hasPermission("project.read", {
    userId: session.user.id,
    projectId: id,
  });
  if (!canRead) notFound();

  return (
    <AppShell
      sidebar={
        <AppSidebar
          surface={{
            kind: "owner-project",
            projectId: id,
            projectName: project.name,
            slug: project.slug,
          }}
        />
      }
      footerLeft={`${project.slug} · ${clusterLabel()} · BAGS.fm`}
    >
      <SolanaWalletProvider>{children}</SolanaWalletProvider>
    </AppShell>
  );
}
