import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth";
import {
  hasPermission,
  PermissionError,
  requirePermission,
} from "@/lib/auth/permissions";
import { getProjectRecord } from "@/lib/queries/dashboard";
import { hasCredentials, serverEnv } from "@/lib/env";
import { resolveGitHubInstallationForRepo } from "@/lib/github/installations";
import { bindProjectGitHubInstallation } from "@/lib/github/project-installation";

/**
 * GET /api/projects/[id]/install-github
 *
 * Kicks off the GitHub App installation flow for the given project. Verifies
 * the caller is signed in and has `project.update` on the project, then
 * redirects them to the App's "install" URL with a signed `state` parameter
 * the callback uses to bind the resulting installation_id back to this
 * project.
 *
 * The App slug must be configured via the `GITHUB_APP_SLUG` env var
 * (operator-supplied; not in the typed env schema yet). If absent, returns
 * 503.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json(
      { error: "db_unavailable" },
      { status: 503 },
    );
  }
  const env = serverEnv();
  if (!env.BETTER_AUTH_SECRET) {
    return NextResponse.json(
      { error: "auth_secret_missing" },
      { status: 503 },
    );
  }

  const slug = env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      {
        error: "github_app_slug_missing",
        message:
          "Set GITHUB_APP_SLUG in env (the App's URL slug, e.g. 'gitshipt-app').",
      },
      { status: 503 },
    );
  }

  const { id: projectId } = await params;

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 404 (not 403) if project missing — don't leak existence.
  const project = await getProjectRecord(projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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

  const dashboardBack = new URL(
    `/dashboard/projects/${projectId}/repository`,
    req.url,
  );

  if (project.ghInstallationId) {
    dashboardBack.searchParams.set("installed", "1");
    return NextResponse.redirect(dashboardBack, 302);
  }

  if (hasCredentials.githubApp()) {
    try {
      const resolved = await resolveGitHubInstallationForRepo({
        owner: project.ghOwner,
        repo: project.ghRepo,
      });
      if (resolved) {
        await bindProjectGitHubInstallation({
          projectId,
          installationId: resolved.installationId,
          actorUserId: session.user.id,
          setupAction: "existing",
          request: req,
          resolvedFromExistingInstall: true,
        });
        dashboardBack.searchParams.set("installed", "1");
        dashboardBack.searchParams.set("source", "existing");
        return NextResponse.redirect(dashboardBack, 302);
      }
    } catch (error) {
      console.warn(
        `[github-install:${projectId}] existing installation lookup failed`,
        error,
      );
    }
  }

  const sig = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(projectId)
    .digest("hex");
  const state = `${projectId}.${sig}`;

  const installUrl =
    `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` +
    `?state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(installUrl, 302);
}
