import { Suspense } from "react";
import { hasCredentials } from "@/lib/env";
import { loadProjectFor } from "../../../_components/loadProject";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Sparkles } from "lucide-react";
import { GeneralForm } from "./_components/GeneralForm";
import { PauseSection } from "./_components/PauseSection";
import { TransferForm } from "./_components/TransferForm";
import { DangerSection } from "./_components/DangerSection";

export default function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent params={params} />
    </Suspense>
  );
}

async function SettingsPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "project.update");
  const { project } = ctx;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Settings" },
        ]}
      />

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>General</CardTitle>
          <CardDescription>Display name, description, image.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-5">
          <GeneralForm
            projectId={id}
            initialName={project.name}
            initialDescription={project.description}
            initialImageUrl={project.imageUrl}
          />
        </CardContent>
      </Card>

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>Pause project</CardTitle>
          <CardDescription>
            While paused, snapshots and payouts are skipped. Public page shows a
            paused badge. Toggle anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-5">
          <PauseSection
            projectId={id}
            status={project.status}
            pausedReason={project.pausedReason}
          />
        </CardContent>
      </Card>

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>Transfer ownership</CardTitle>
          <CardDescription>
            Hand the project to another GitShipt user — by their GitHub
            username. They must already have signed in at least once.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-5">
          <TransferForm projectId={id} slug={project.slug} />
        </CardContent>
      </Card>

      <Card depth="flat" padding="none" className="border-danger/40">
        <CardHeader className="border-b border-danger/40 px-6 py-4">
          <CardTitle className="text-danger">Danger zone</CardTitle>
          <CardDescription>
            Deleting marks the project killed. Bags fee claims remain owned by
            their wallets. There is a 24-hour cool-down before re-launching the
            same repo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-5">
          <DangerSection projectId={id} slug={project.slug} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stub() {
  return (
    <div className="mx-auto w-full max-w-content">
      <EmptyState
        icon={Sparkles}
        title="Stub mode"
        description="Set DATABASE_URL or POSTGRES_URL to manage settings."
      />
    </div>
  );
}
