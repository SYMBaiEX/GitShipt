import "@/db/rls-storage-init";
import { NextResponse } from "next/server";
import { and, eq, or, type SQL } from "drizzle-orm";
import { dbHttp } from "@/db";
import { projects, webhooksInbox } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  extractTokenMint,
  extractTransactionSignature,
  verifyAndParseBagsWebhook,
} from "@/lib/bags/webhook";
import { revalidateProjectCaches } from "@/lib/cache";
import { enterDbServiceContext } from "@/lib/db-rls";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const result = await verifyAndParseBagsWebhook(req);
  if (!result.ok) {
    if (result.reason === "no_secret") {
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }
  enterDbServiceContext("webhook:bags");

  const insertResult = await dbHttp
    .insert(webhooksInbox)
    .values({
      source: "bags",
      eventId: result.delivery,
      eventType: result.event,
      signature: result.signature,
      payload: result.payload,
    })
    .onConflictDoNothing({
      target: [webhooksInbox.source, webhooksInbox.eventId],
    })
    .returning({ id: webhooksInbox.id });

  const tokenMint = extractTokenMint(result.payload);
  const txSignature = extractTransactionSignature(result.payload);

  if (insertResult.length === 0) {
    await safeAudit({
      eventType: result.event,
      deliveryId: result.delivery,
      tokenMint,
      txSignature,
      processed: false,
      duplicate: true,
      projectId: null,
    });
    return NextResponse.json({ ok: true, status: "duplicate" });
  }

  const projectPredicates: SQL[] = [];
  if (tokenMint) projectPredicates.push(eq(projects.tokenMint, tokenMint));
  if (txSignature) {
    projectPredicates.push(eq(projects.bagsLaunchSignature, txSignature));
    projectPredicates.push(eq(projects.bagsLaunchId, txSignature));
  }

  const [project] =
    projectPredicates.length > 0
      ? await dbHttp
          .select({ id: projects.id })
          .from(projects)
          .where(or(...projectPredicates))
          .limit(1)
      : [];

  await dbHttp
    .update(webhooksInbox)
    .set({ processedAt: new Date() })
    .where(
      and(
        eq(webhooksInbox.source, "bags"),
        eq(webhooksInbox.eventId, result.delivery),
      ),
    );

  if (project?.id) {
    await revalidateProjectCaches(project.id);
  }

  await safeAudit({
    eventType: result.event,
    deliveryId: result.delivery,
    tokenMint,
    txSignature,
    processed: true,
    duplicate: false,
    projectId: project?.id ?? null,
  });

  return NextResponse.json({
    ok: true,
    projectId: project?.id ?? null,
  });
}

async function safeAudit(metadata: {
  eventType: string;
  deliveryId: string;
  tokenMint: string | null;
  txSignature: string | null;
  processed: boolean;
  duplicate: boolean;
  projectId: string | null;
}) {
  try {
    await audit({
      actorUserId: null,
      action: "bags.event",
      targetType: metadata.projectId ? "project" : "platform",
      targetId: metadata.projectId ?? "bags",
      metadata,
    });
  } catch {
    // Webhook acknowledgment must not depend on audit availability.
  }
}
