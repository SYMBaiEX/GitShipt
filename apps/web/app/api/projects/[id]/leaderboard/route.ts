import "server-only";
import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/env";
import {
  readPresentedApiKey,
  verifyProjectApiKey,
} from "@/lib/auth/api-key-auth";
import { getProjectRecord } from "@/lib/queries/dashboard";
import { getProjectLeaderboard } from "@/lib/queries/project-page";
import { ProjectLeaderboardResponseSchema } from "@repo/shared";


/**
 * Public leaderboard API for embeds, docs, and partner integrations.
 * Returns the same ranked rows rendered on `/r/[org]/[repo]`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!hasCredentials.db()) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  const { id } = await params;
  const project = await getProjectRecord(id);
  if (!project || !["live", "paused", "simulated_live", "tracked"].includes(project.status)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const hasApiKey = Boolean(readPresentedApiKey(req));
  if (hasApiKey) {
    const apiKeyAuth = await verifyProjectApiKey(req, id, "read:leaderboard");
    if (!apiKeyAuth.ok) return apiKeyAuth.response;
  }

  const leaderboard = await getProjectLeaderboard(id, project.payoutConfig);
  const payload = ProjectLeaderboardResponseSchema.parse({
    projectId: id,
    slug: project.slug,
    generatedAt: new Date().toISOString(),
    leaderboard,
  });

  const response = NextResponse.json(payload);
  if (hasApiKey) {
    response.headers.set("x-gitshipt-api-key-auth", "read:leaderboard");
  }
  return response;
}
