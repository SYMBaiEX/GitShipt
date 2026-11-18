import { SidebarProvider } from "@repo/ui";
import { AppFrame } from "@/components/sidebar/AppFrame";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { clusterLabel } from "@/lib/solana/explorer";

export function PublicAppShell({
  footerLeft = `${clusterLabel()} · BAGS.fm`,
  children,
}: {
  footerLeft?: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
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
