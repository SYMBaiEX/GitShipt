import { SidebarProvider } from "@repo/ui";
import { AppFrame } from "@/components/sidebar/AppFrame";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { clusterLabel } from "@/lib/solana/explorer";

export type PublicSidebarActive = string | undefined;

export function PublicAppShell({
  footerLeft = `${clusterLabel()} · BAGS.fm`,
  defaultSidebarCollapsed = false,
  children,
}: {
  active?: PublicSidebarActive;
  footerLeft?: string;
  defaultSidebarCollapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultCollapsed={defaultSidebarCollapsed}>
      <AppFrame
        surface="public"
        sidebar={<AppSidebar surface={{ kind: "public" }} />}
        footer={footerLeft}
        contentClassName="bg-app-gradient lg:px-10"
      >
        <div className="mx-auto w-full max-w-content">{children}</div>
      </AppFrame>
    </SidebarProvider>
  );
}
