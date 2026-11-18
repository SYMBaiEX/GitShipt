import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { AppShell } from "../_components/AppShell";
import { clusterLabel } from "@/lib/solana/explorer";

export default function DashboardAccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      sidebar={<AppSidebar surface={{ kind: "public" }} />}
      footerLeft={`Account · ${clusterLabel()} · BAGS.fm`}
    >
      {children}
    </AppShell>
  );
}
