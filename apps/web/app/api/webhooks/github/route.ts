import "@/db/rls-storage-init";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { dbHttp } from "@/db";
import { webhooksInbox, projects } from "@/db/schema";
import { verifyAndParse } from "@/lib/github/webhook";
import { audit } from "@/lib/audit";
import { indexProjectDeltas } from "@/workflows/indexProjectDeltas";
import { revalidateProjectCaches } from "@/lib/cache";
import { enterDbServiceContext } from "@/lib/db-rls";

export const maxDuration = 60;

type GithubPayload = {
  repository?: { id: number; full_name: string };
  installation?: { id: number };
  action?: string;
  pull_request?: { merged?: boolean };
  sender?: { login?: string };
};

/**
 * GitHub webhook receiver. Verifies HMAC, deduplicates on (source, delivery)
 * via `webhooks_inbox`, routes push/PR-merge events to the per-project
 * indexer, and marks the inbox row processed.
 */
export async function POST(req: Request): Promise<Response> {
  const result = await verifyAndParse(req);
  if (!result.ok) {
    if (result.reason === "no_secret") {
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }
  enterDbServiceContext("webhook:github");

  const signature = req.headers.get("x-hub-signature-256");
  const insertResult = await dbHttp
    .insert(webhooksInbox)
    .values({
      source: "github",
      eventId: result.delivery,
      eventType: result.event,
      signature,
      payload: result.payload as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [webhooksInbox.source, webhooksInbox.eventId],
    })
    .returning({ id: webhooksInbox.id });

  const payload = result.payload as GithubPayload;

  if (insertResult.length === 0) {
    try {
      await audit({
        actorUserId: null,
        action: "github.event",
        targetType: "platform",
        targetId: "github",
        metadata: {
          eventType: result.event,
          deliveryId: result.delivery,
          installationId: payload.installation?.id ?? null,
          repo: payload.repository?.full_name ?? null,
          action: payload.action ?? null,
          senderLogin: payload.sender?.login ?? null,
          processed: false,
        },
      });
    } catch {
      // Audit failures must never block the webhook 200 response.
    }
    return NextResponse.json({ ok: true, status: "duplicate" });
  }

  const isPush = result.event === "push";
  const isMergedPR =
    result.event === "pull_request" &&
    payload.action === "closed" &&
    payload.pull_request?.merged === true;

  let resolvedProjectId: string | null = null;
  if ((isPush || isMergedPR) && payload.repository) {
    const repoId = String(payload.repository.id);
    const [proj] = await dbHttp
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(eq(projects.ghRepoId, repoId))
      .limit(1);
    if (proj) {
      resolvedProjectId = proj.id;
      if (proj.status === "live") {
        await start(indexProjectDeltas, [proj.id]);
        await revalidateProjectCaches(proj.id);
      }
    }
  }

  // installation event handling deferred (linked at launch wizard time).

  await dbHttp
    .update(webhooksInbox)
    .set({ processedAt: new Date() })
    .where(
      and(
        eq(webhooksInbox.source, "github"),
        eq(webhooksInbox.eventId, result.delivery),
      ),
    );

  try {
    await audit({
      actorUserId: null,
      action: "github.event",
      targetType: resolvedProjectId ? "project" : "platform",
      targetId: resolvedProjectId ?? "github",
      metadata: {
        eventType: result.event,
        deliveryId: result.delivery,
        installationId: payload.installation?.id ?? null,
        repo: payload.repository?.full_name ?? null,
        action: payload.action ?? null,
        senderLogin: payload.sender?.login ?? null,
        processed: true,
      },
    });
  } catch {
    // Audit failures must never block the webhook 200 response.
  }

  return NextResponse.json({ ok: true });
}
