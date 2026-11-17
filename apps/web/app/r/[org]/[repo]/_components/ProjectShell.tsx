import { SidebarProvider } from "@repo/ui";
import { AppFrame } from "@/components/sidebar/AppFrame";
import type { ProjectHeader } from "@/lib/queries/project-page";
import { clusterLabel } from "@/lib/solana/explorer";
import { ProjectShellSidebar } from "./ProjectShellClient";

export type ProjectSidebarActive =
  | "leaderboard"
  | "feed"
  | "payouts"
  | "snapshots"
  | "repository"
  | "token"
  | "settings"
  | "api-keys"
  | "team"
  | "docs";

export function ProjectShell({
  header,
  active,
  canAdmin = false,
  defaultSidebarCollapsed = false,
  children,
}: {
  header: ProjectHeader;
  active?: ProjectSidebarActive;
  canAdmin?: boolean;
  defaultSidebarCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const slug = `${header.ghOwner}/${header.ghRepo}`;
  return (
    <SidebarProvider defaultCollapsed={defaultSidebarCollapsed}>
      <AppFrame
        surface={{
          projectPath: `/r/${slug}`,
          repoUrl: `https://github.com/${slug}`,
        }}
        title={header.name}
        footer={`${slug} · ${clusterLabel()} · BAGS.fm`}
        sidebar={
          <ProjectShellSidebar
            surface={{
              kind: "public-project",
              projectId: header.id,
              projectName: header.name,
              slug,
              canAdmin,
            }}
            active={active}
          />
        }
      >
        {children}
      </AppFrame>
    </SidebarProvider>
  );
}
