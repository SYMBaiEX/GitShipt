import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  hasPermission,
  PermissionError,
  requirePermission,
} from "@/lib/auth/permissions";
import { dbHttp } from "@/db";
import { projects } from "@/db/schema";
import { hasCredentials, serverEnv } from "@/lib/env";
import { resolveGitHubInstallationForRepo } from "@/lib/github/installations";
import { bindProjectGitHubInstallation } from "@/lib/github/project-installation";

/**
 * GET /api/projects/[id]/install-github/callback
 *
 * GitHub redirects here after the user installs (or attempts to install)
 * the GitHub App. We:
 *   1. Verify the HMAC-signed `state` matches the projectId.
 *   2. Re-validate the session and `project.update` permission.
 *   3. Persist the `installation_id` on the project row.
 *   4. Audit the event.
 *   5. Bounce the user back to the repository settings page with `?installed=1`.
 *
 * Note: when `setup_action=request` (org admin must approve), we just record
 * the attempt and redirect with a hint — no installation_id yet.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }
  const env = serverEnv();
  if (!env.BETTER_AUTH_SECRET) {
    return NextResponse.json({ error: "auth_secret_missing" }, { status: 503 });
  }

  const { id: projectId } = await params;
  const url = new URL(req.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action") ?? "install";
  const state = url.searchParams.get("state") ?? "";

  // ---- Verify state HMAC -------------------------------------------------
  const dot = state.indexOf(".");
  if (dot < 0) {
    return NextResponse.json({ error: "bad_state" }, { status: 400 });
  }
  const stateProjectId = state.slice(0, dot);
  const stateSig = state.slice(dot + 1);
  if (stateProjectId !== projectId) {
    return NextResponse.json(
      { error: "state_project_mismatch" },
      { status: 400 },
    );
  }
  const expected = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(projectId)
    .digest("hex");
  const a = Buffer.from(stateSig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { error: "state_signature_mismatch" },
      { status: 400 },
    );
  }

  // ---- Auth + permission -------------------------------------------------
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ok = await hasPermission("project.update", {
    userId: session.user.id,
    projectId,
  });
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    await requirePermission("project.update", {
      userId: session.user.id,
      projectId,
    });
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }

  // ---- Confirm project still exists --------------------------------------
  const [proj] = await dbHttp
    .select({
      id: projects.id,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dashboardBack = new URL(
    `/dashboard/projects/${projectId}/repository`,
    url,
  );

  // For request-only flows (org admin must approve), bail with a hint.
  if (setupAction === "request") {
    dashboardBack.searchParams.set("installed", "pending");
    return NextResponse.redirect(dashboardBack, 302);
  }

  if (!installationIdRaw) {
    if (hasCredentials.githubApp()) {
      try {
        const resolved = await resolveGitHubInstallationForRepo({
          owner: proj.ghOwner,
          repo: proj.ghRepo,
        });
        if (resolved) {
          await bindProjectGitHubInstallation({
            projectId,
            installationId: resolved.installationId,
            actorUserId: session.user.id,
            setupAction: setupAction || "existing",
            request: req,
            resolvedFromExistingInstall: true,
          });
          dashboardBack.searchParams.set("installed", "1");
          dashboardBack.searchParams.set("source", "existing");
          return NextResponse.redirect(dashboardBack, 302);
        }
      } catch (error) {
        console.warn(
          `[github-install:${projectId}] callback installation lookup failed`,
          error,
        );
      }
    }

    dashboardBack.searchParams.set("installed", "pending");
    return NextResponse.redirect(dashboardBack, 302);
  }

  // installation_id should be a positive integer from GitHub.
  if (!/^\d+$/.test(installationIdRaw)) {
    return NextResponse.json({ error: "bad_installation_id" }, { status: 400 });
  }

  // ---- Persist + audit ---------------------------------------------------
  await bindProjectGitHubInstallation({
    projectId,
    installationId: installationIdRaw,
    actorUserId: session.user.id,
    setupAction,
    request: req,
  });
  dashboardBack.searchParams.set("installed", "1");
  return NextResponse.redirect(dashboardBack, 302);
}
