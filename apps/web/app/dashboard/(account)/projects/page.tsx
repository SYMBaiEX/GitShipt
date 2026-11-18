import { Suspense } from "react";
import { Rocket, FolderGit2, Pencil } from "lucide-react";
import { hasCredentials } from "@/lib/env";
import { requireAuthSession } from "@/lib/auth/session";
import { getMyProjects } from "@/lib/queries/dashboard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@repo/ui";
import { ProjectList } from "../../_components/ProjectList";
import { DraftRow } from "../../_components/DraftRow";
import { ConsoleLoading } from "@/components/sidebar/ConsoleLoading";


/**
 * `/dashboard/projects` — drafts + launched projects.
 *
 * Drafts get a dedicated card at the top with Continue/Discard actions.
 * Launched projects use the standard ProjectList rendering.
 */
export default function ProjectsPage() {
  return (
    <div className="mx-auto w-full max-w-content space-y-4">
      <h1 className="text-headline-md">My projects</h1>
      <Suspense fallback={<ConsoleLoading label="projects" tiles={2} />}>
        <ProjectsPageContent />
      </Suspense>
    </div>
  );
}

async function ProjectsPageContent() {
  if (!hasCredentials.db()) {
    return (
      <div className="mx-auto w-full max-w-content">
        <EmptyState
          icon={FolderGit2}
          title="Stub mode"
          description="Set DATABASE_URL or POSTGRES_URL to view your projects."
          cta={{ label: "Sign in", href: "/auth/signin" }}
        />
      </div>
    );
  }

  const session = await requireAuthSession("/dashboard/projects");
  const projects = await getMyProjects(session.user.id);
  const drafts = projects.filter((p) => p.status === "draft");
  const launched = projects.filter((p) => p.status !== "draft");

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-4">
      {drafts.length > 0 ? (
        <Card depth="flat" padding="none">
          <CardHeader className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Pencil className="size-4 text-fg-secondary" />
              <CardTitle>
                {drafts.length} draft{drafts.length === 1 ? "" : "s"} in
                progress
              </CardTitle>
            </div>
            <CardDescription>
              Pick up where you left off, or discard to free the repo slot.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {drafts.map((d) => (
                <DraftRow
                  key={d.id}
                  row={{
                    id: d.id,
                    slug: d.slug,
                    name: d.name,
                    imageUrl: d.imageUrl,
                    status: "draft",
                    createdAt: d.createdAt,
                  }}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card depth="flat" padding="none">
        <CardHeader className="border-b border-border px-6 py-4">
          <CardTitle>
            {launched.length} launched project
            {launched.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Tap any row to open the per-project console.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {launched.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Rocket}
                title="Launch your first token"
                description="Mint a Bags.fm token for your repo and start the daily fee pool."
                cta={{ label: "Launch a token", href: "/launch" }}
              />
            </div>
          ) : (
            <ProjectList rows={launched} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
