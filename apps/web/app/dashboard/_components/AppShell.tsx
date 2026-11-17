import { AppFrame } from "@/components/sidebar/AppFrame";
import { clusterLabel } from "@/lib/solana/explorer";

export function AppShell({
  sidebar,
  footerLeft,
  children,
}: {
  sidebar: React.ReactNode;
  footerLeft?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AppFrame
      sidebar={sidebar}
      surface="dashboard"
      title="Console"
      footer={footerLeft ?? `GitShipt Console · ${clusterLabel()} · BAGS.fm`}
    >
      {children}
    </AppFrame>
  );
}
