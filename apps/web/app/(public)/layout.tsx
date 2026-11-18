import { PublicAppShell } from "@/components/public/PublicAppShell";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicAppShell>{children}</PublicAppShell>;
}
