import "server-only";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { dbHttp } from "@/db";
import { projects } from "@/db/schema";
import { hasCredentials } from "@/lib/env";
import { check } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { requirePermission, PermissionError } from "@/lib/auth/permissions";
import { privateNoStoreJson } from "@/lib/no-store-response";
import {
  revalidateAdminCaches,
  revalidateProjectCaches,
  revalidateUserCaches,
} from "@/lib/cache";
import { UpdateDraftBodySchema } from "@repo/shared";


const json = privateNoStoreJson;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/{id} — read draft state for the wizard's hydration path
 * and the project console.
 *
 * Auth: caller must hold `project.read` for the project (project_owner /
 * project_moderator membership, or a global staff role).
 */
export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  if (!hasCredentials.db()) {
    return json(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const params = await ctx.params;
  const projectId = params.id;
  if (!projectId) {
    return json({ error: "missing_id" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await check("default", `project-read:${userId ?? ip}`);
  if (!limit.success) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const [project] = await dbHttp
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return json({ error: "not_found" }, { status: 404 });
  }

  try {
    await requirePermission("project.read", { userId, projectId });
  } catch (e) {
    if (e instanceof PermissionError) {
      return json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  return json({
    id: project.id,
    ghOwner: project.ghOwner,
    ghRepo: project.ghRepo,
    ghRepoId: project.ghRepoId,
    ghInstallationId: project.ghInstallationId,
    name: project.name,
    symbol: project.symbol,
    description: project.description,
    imageUrl: project.imageUrl,
    tokenWebsiteUrl: project.tokenWebsiteUrl,
    tokenTwitterUrl: project.tokenTwitterUrl,
    tokenTelegramUrl: project.tokenTelegramUrl,
    tokenMint: project.tokenMint,
    bagsLaunchId: project.bagsLaunchId,
    bagsConfigKey: project.bagsConfigKey,
    status: project.status,
    platformFeeBps: project.platformFeeBps,
    scoringConfig: project.scoringConfig,
    payoutConfig: project.payoutConfig,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/**
 * PATCH /api/projects/{id} — update a draft.
 *
 * Drafts only — once a project leaves draft status the wizard no longer owns
 * its config. Repo identity is locked at create time.
 */
export async function PATCH(
  req: Request,
  ctx: RouteContext,
): Promise<Response> {
  if (!hasCredentials.db()) {
    return json(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const params = await ctx.params;
  const projectId = params.id;
  if (!projectId) {
    return json({ error: "missing_id" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent");

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await check("default", `draft-update:${userId ?? ip}`);
  if (!limit.success) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const [project] = await dbHttp
    .select({
      id: projects.id,
      status: projects.status,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      payoutConfig: projects.payoutConfig,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return json({ error: "not_found" }, { status: 404 });
  }
  if (project.status !== "draft") {
    return json(
      {
        error: "not_draft",
        message:
          "This project has already left draft status. Use the project console to edit settings.",
      },
      { status: 409 },
    );
  }

  try {
    await requirePermission("project.update", { userId, projectId });
  } catch (e) {
    if (e instanceof PermissionError) {
      return json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateDraftBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return json(
      { error: "idempotency_key_required" },
      { status: 400 },
    );
  }

  try {
    await withIdempotency(
      idempotencyKey,
      async () => {
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (body.name !== undefined) updates.name = body.name;
        if (body.symbol !== undefined) updates.symbol = body.symbol;
        if (body.description !== undefined)
          updates.description = body.description;
        if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
        if (body.website !== undefined)
          updates.tokenWebsiteUrl = body.website || null;
        if (body.twitter !== undefined)
          updates.tokenTwitterUrl = body.twitter || null;
        if (body.telegram !== undefined)
          updates.tokenTelegramUrl = body.telegram || null;
        if (body.scoringConfig !== undefined)
          updates.scoringConfig = body.scoringConfig;
        if (body.payoutConfig !== undefined) {
          updates.payoutConfig = body.payoutConfig.rewardMode === undefined
            ? { ...body.payoutConfig, rewardMode: project.payoutConfig.rewardMode }
            : body.payoutConfig;
        }

        const [updated] = await dbHttp
          .update(projects)
          .set(updates)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.status, "draft"),
            sql`${projects.payoutConfig}->>'rewardMode' IS NOT DISTINCT FROM ${project.payoutConfig.rewardMode ?? null}`,
          ))
          .returning({ id: projects.id });
        if (!updated) throw new Error("draft_no_longer_editable");

        await audit({
          actorUserId: userId,
          action: "project.update",
          targetType: "project",
          targetId: projectId,
          metadata: {
            phase: "draft",
            fields: Object.keys(updates).filter((k) => k !== "updatedAt"),
          },
          ip,
          userAgent,
        });

        return { ok: true };
      },
      { scope: `project:patch:${userId}:${projectId}` },
    );

    await revalidateProjectCaches(
      projectId,
      `${project.ghOwner}/${project.ghRepo}`,
    );

    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "draft_no_longer_editable") return json({ error: "not_draft", message: "This project has already left draft status." }, { status: 409 });
    const message = e instanceof Error ? e.message : "Failed to update draft.";
    console.error("[projects:patch] failed:", e);
    return json(
      { error: "update_failed", message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/{id} — discard a draft.
 *
 * Drafts only. Frees the (ghOwner, ghRepo) UNIQUE slot so the user can pick
 * a different repo. Launched projects are never deleted via this route.
 */
export async function DELETE(
  req: Request,
  ctx: RouteContext,
): Promise<Response> {
  if (!hasCredentials.db()) {
    return json(
      { error: "db_unavailable", message: "DB not configured." },
      { status: 503 },
    );
  }

  const params = await ctx.params;
  const projectId = params.id;
  if (!projectId) {
    return json({ error: "missing_id" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent");

  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await check("default", `draft-delete:${userId ?? ip}`);
  if (!limit.success) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return json(
      { error: "idempotency_key_required" },
      { status: 400 },
    );
  }

  try {
    const result = await withIdempotency(
      idempotencyKey,
      async () => {
        const [project] = await dbHttp
          .select({
            id: projects.id,
            status: projects.status,
            ghOwner: projects.ghOwner,
            ghRepo: projects.ghRepo,
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project) {
          return { status: 404, body: { error: "not_found" }, cacheSlug: null };
        }
        if (project.status !== "draft") {
          return {
            status: 409,
            body: {
              error: "not_draft",
              message:
                "Only drafts can be deleted. Launched projects must be paused or killed instead.",
            },
            cacheSlug: null,
          };
        }

        try {
          // project.delete permission is owner-only; admins cannot reach in and
          // discard a user's draft.
          await requirePermission("project.delete", { userId, projectId });
        } catch (e) {
          if (e instanceof PermissionError) {
            return {
              status: 403,
              body: { error: "forbidden" },
              cacheSlug: null,
            };
          }
          throw e;
        }

        await dbHttp.delete(projects).where(eq(projects.id, projectId));

        await audit({
          actorUserId: userId,
          action: "project.delete",
          targetType: "project",
          targetId: projectId,
          metadata: {
            phase: "draft",
            ghOwner: project.ghOwner,
            ghRepo: project.ghRepo,
          },
          ip,
          userAgent,
        });

        return {
          status: 200,
          body: { ok: true },
          cacheSlug: `${project.ghOwner}/${project.ghRepo}`,
        };
      },
      { scope: `project:delete:${userId}:${projectId}` },
    );

    if (result.status === 200 && result.cacheSlug) {
      await revalidateProjectCaches(projectId, result.cacheSlug);
      revalidateUserCaches(userId);
      revalidateAdminCaches();
    }

    return json(result.body, { status: result.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to discard draft.";
    console.error("[projects:delete] failed:", e);
    return json(
      { error: "delete_failed", message },
      { status: 500 },
    );
  }
}
