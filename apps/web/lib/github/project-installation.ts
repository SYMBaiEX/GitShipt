import "server-only";
import { eq } from "drizzle-orm";

import { dbHttp } from "@/db";
import { projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { revalidateProjectCaches } from "@/lib/cache";
import { withIdempotency } from "@/lib/idempotency";

interface BindProjectGitHubInstallationInput {
  projectId: string;
  installationId: string;
  actorUserId: string;
  setupAction: string;
  request: Request;
  resolvedFromExistingInstall?: boolean;
}

export async function bindProjectGitHubInstallation({
  projectId,
  installationId,
  actorUserId,
  setupAction,
  request,
  resolvedFromExistingInstall = false,
}: BindProjectGitHubInstallationInput): Promise<void> {
  await withIdempotency(
    `github-install:${projectId}:${installationId}:${setupAction}`,
    async () => {
      await dbHttp
        .update(projects)
        .set({
          ghInstallationId: installationId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      await audit({
        actorUserId,
        action: "project.gh_app_install",
        targetType: "project",
        targetId: projectId,
        metadata: {
          installationId,
          setupAction,
          resolvedFromExistingInstall,
        },
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      });

      return { ok: true };
    },
    { scope: `project:github-install:${projectId}` },
  );

  await revalidateProjectCaches(projectId);
}
