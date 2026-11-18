import { Suspense } from "react";
import { hasCredentials } from "@/lib/env";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { AppShell } from "../../_components/AppShell";
import { clusterLabel } from "@/lib/solana/explorer";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";
import { loadProjectFor } from "../../_components/loadProject";
import { ConsoleFrameLoading } from "@/components/sidebar/ConsoleLoading";

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
    <Suspense fallback={<ConsoleFrameLoading title="Project console" />}>
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
  const { project } = await loadProjectFor(id, "project.read");

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
