import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAuthSession } from "@/lib/auth/session";
import {
  requirePermission,
  PermissionError,
  type Permission,
} from "@/lib/auth/permissions";
import { getProjectRecordForUser, type ProjectRecord } from "@/lib/queries/dashboard";

export interface LoadedProjectContext {
  userId: string;
  userName: string;
  userEmail: string;
  project: ProjectRecord;
}

/**
 * Server-side helper used by every `/dashboard/projects/[id]/**` page.
 *
 *  1. Re-validates the better-auth session (CVE-2025-29927 mitigation).
 *  2. Checks the requested permission for this project (404 on deny — we
 *     don't reveal that the project exists to unprivileged users).
 *  3. Loads the project under that principal's row-level security scope.
 */
export const loadProjectFor = cache(async function loadProjectFor(
  projectId: string,
  permission: Permission,
): Promise<LoadedProjectContext> {
  const session = await requireAuthSession(`/dashboard/projects/${projectId}`);
  let role;
  try {
    role = await requirePermission(permission, {
      userId: session.user.id,
      projectId,
    });
  } catch (e) {
    if (e instanceof PermissionError) notFound();
    throw e;
  }
  const project = await getProjectRecordForUser(projectId, session.user.id, role);
  if (!project) notFound();

  return {
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "user",
    userEmail: session.user.email ?? "",
    project,
  };
});
