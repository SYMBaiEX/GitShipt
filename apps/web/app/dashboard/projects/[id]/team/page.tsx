import { Suspense } from "react";
import Image from "next/image";
import { Sparkles, Users } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { getProjectMembers } from "@/lib/queries/dashboard";
import { formatRelativeTime } from "@repo/lib";
import { loadProjectFor } from "../../../_components/loadProject";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { Badge } from "@repo/ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import {
  MemberInviteForm,
  MemberRemoveButton,
} from "./_components/TeamControls";


export default function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <TeamPageContent params={params} />
    </Suspense>
  );
}

async function TeamPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasCredentials.db()) return <Stub />;
  const { id } = await params;
  const ctx = await loadProjectFor(id, "project.update");
  const { project } = ctx;
  const members = await getProjectMembers(id);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${id}` },
          { label: "Team" },
        ]}
      />

      <Card depth="flat" padding="default">
        <div className="space-y-2">
          <h2 className="text-headline-sm text-fg">Add moderator</h2>
          <p className="text-body-sm text-fg-secondary">
            Add an existing GitShipt user by GitHub username or email. Moderators
            can read project data, inspect payouts, and help operate snapshots.
          </p>
          <MemberInviteForm projectId={id} />
        </div>
      </Card>

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>
            {members.length} member{members.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Project owner access is controlled by ownership transfer. Moderator
            access can be added or revoked here.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState
                icon={Users}
                title="No co-admins yet"
                description="Add a moderator when another operator needs project-console access."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-6 py-3"
                >
                  {m.image ? (
                    <Image
                      src={m.image}
                      alt={m.name}
                      width={40}
                      height={40}
                      sizes="40px"
                      className="size-10 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-full bg-surface-elevated text-label-sm text-fg-muted">
                      {m.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-label-md text-fg">
                      {m.name}
                    </div>
                    <div className="truncate text-mono-sm text-fg-muted">
                      {m.email}
                    </div>
                  </div>
                  <Badge
                    variant={m.role === "project_owner" ? "info" : "default"}
                    size="sm"
                  >
                    {m.role.replace("project_", "")}
                  </Badge>
                  <span className="text-caption text-fg-muted">
                    {formatRelativeTime(m.createdAt)}
                  </span>
                  <MemberRemoveButton
                    projectId={id}
                    userId={m.userId}
                    disabled={m.userId === project.ownerUserId}
                  />
                </li>
              ))}
            </ul>
          )}
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
        description="Set DATABASE_URL or POSTGRES_URL to view team members."
      />
    </div>
  );
}
