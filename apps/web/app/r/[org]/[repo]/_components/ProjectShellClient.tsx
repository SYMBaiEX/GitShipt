"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import type { AppSidebarSurface } from "@/components/sidebar/AppSidebar";
import type { ProjectSidebarActive } from "./ProjectShell";

const ACTIVE_BY_SEGMENT: Record<string, ProjectSidebarActive> = {
  docs: "docs",
  feed: "feed",
  payouts: "payouts",
  repository: "repository",
  snapshots: "snapshots",
  token: "token",
};

function useProjectActive(
  override?: ProjectSidebarActive,
): ProjectSidebarActive {
  const segment = useSelectedLayoutSegment();
  if (override) return override;
  if (segment && segment in ACTIVE_BY_SEGMENT) {
    return ACTIVE_BY_SEGMENT[segment]!;
  }
  return "leaderboard";
}

export function ProjectShellSidebar({
  surface,
  active,
}: {
  surface: AppSidebarSurface;
  active?: ProjectSidebarActive;
}) {
  const activeKey = useProjectActive(active);
  return <AppSidebar surface={surface} activeKey={activeKey} />;
}
