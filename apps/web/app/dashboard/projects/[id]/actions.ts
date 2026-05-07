"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { dbHttp } from "@/db";
import {
  platformConfig,
  projectMemberships,
  projects,
  users,
} from "@/db/schema";
import type { ScoringConfig, PayoutConfig } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { check } from "@/lib/rate-limit";
import { updateProjectCaches } from "@/lib/cache-actions";
import { projectDocsKey } from "@/lib/queries/project-docs";
import { PayoutConfigSchema, ScoringConfigSchema } from "@repo/shared";
import { takeProjectSnapshot } from "@/workflows/takeSnapshot";

/**
 * Server Actions for the per-project admin console.
 *
 * Every mutation:
 *   - Re-validates the better-auth session.
 *   - Calls `requirePermission(...)` for the right scope.
 *   - Validates inputs with Zod.
 *   - Wraps the side-effect in `withIdempotency(key, ...)`.
 *   - Writes an `audit(...)` entry.
 *   - Applies a rate limit when appropriate.
 *
 * Errors throw `Error` with a stable message so the client can render
 * a toast. PermissionError throws are surfaced as 403 by the framework.
 */

async function requireSessionUserId(): Promise<string> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/auth/signin");
  }
  return session.user.id;
}

// ---------------------------------------------------------------------------
// pauseProject — toggle live <-> paused
// ---------------------------------------------------------------------------
const pauseSchema = z.object({
  projectId: z.string().min(1),
  pause: z.boolean(),
  reason: z.string().max(280).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function pauseProject(
  input: z.input<typeof pauseSchema>,
): Promise<{ ok: true; status: "live" | "paused" }> {
  const data = pauseSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("project.pause", {
    userId,
    projectId: data.projectId,
  });

  const rl = await check("default", `pause:${userId}:${data.projectId}`);
  if (!rl.success) throw new Error("Rate limited — try again shortly.");

  const result = await withIdempotency(
    data.idempotencyKey ??
      `pause:${data.projectId}:${data.pause ? "1" : "0"}:${Date.now()}`,
    async () => {
      const next = data.pause ? ("paused" as const) : ("live" as const);
      await dbHttp
        .update(projects)
        .set({
          status: next,
          pausedAt: data.pause ? new Date() : null,
          pausedReason: data.pause ? (data.reason ?? null) : null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, data.projectId));
      return { status: next };
    },
    { scope: `project:pause:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "project.pause",
    targetType: "project",
    targetId: data.projectId,
    metadata: { pause: data.pause, reason: data.reason ?? null },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath(`/dashboard/projects/${data.projectId}/settings`);
  await updateProjectCaches(data.projectId);
  return { ok: true, status: result.status };
}

// ---------------------------------------------------------------------------
// updateScoringConfig — edit windowDays / weights / claim threshold
// ---------------------------------------------------------------------------
const updateScoringSchema = z.object({
  projectId: z.string().min(1),
  scoring: ScoringConfigSchema,
  payout: PayoutConfigSchema,
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function updateScoringConfig(
  input: z.input<typeof updateScoringSchema>,
): Promise<{ ok: true }> {
  const data = updateScoringSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("scoring.update", {
    userId,
    projectId: data.projectId,
  });

  const rl = await check("default", `scoring:${userId}:${data.projectId}`);
  if (!rl.success) throw new Error("Rate limited — try again shortly.");

  await withIdempotency(
    data.idempotencyKey ?? `scoring:${data.projectId}:${Date.now()}`,
    async () => {
      await dbHttp
        .update(projects)
        .set({
          scoringConfig: data.scoring satisfies ScoringConfig,
          payoutConfig: data.payout satisfies PayoutConfig,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, data.projectId));
      return { ok: true } as const;
    },
    { scope: `project:scoring:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "scoring.update",
    targetType: "project",
    targetId: data.projectId,
    metadata: {
      windowDays: data.scoring.windowDays,
      tierWeights: data.payout.tierWeights,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}/leaderboard`);
  await updateProjectCaches(data.projectId);
  return { ok: true };
}

// Legacy retryPayout action deleted with the off-chain dispatch loop.
// Under the Bags-native architecture there is no per-recipient dispatch to
// retry — the cadence cron either re-runs the BPS rebalance (idempotent on
// plan_hash) or fails loudly and is reset by the operator flipping the
// schedule's `paused_at`.

// ---------------------------------------------------------------------------
// transferOwnership — move ownership to another user (by GitHub username)
// ---------------------------------------------------------------------------
const transferSchema = z.object({
  projectId: z.string().min(1),
  newOwnerGithubUsername: z.string().min(1).max(80),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function transferOwnership(
  input: z.input<typeof transferSchema>,
): Promise<{ ok: true; newOwnerUserId: string }> {
  const data = transferSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("project.transfer", {
    userId,
    projectId: data.projectId,
  });

  const { users } = await import("@/db/schema");
  const [target] = await dbHttp
    .select({ id: users.id })
    .from(users)
    .where(eq(users.githubUsername, data.newOwnerGithubUsername))
    .limit(1);
  if (!target) {
    throw new Error(
      `No GitShipt user with GitHub username "${data.newOwnerGithubUsername}".`,
    );
  }

  const result = await withIdempotency(
    data.idempotencyKey ??
      `transfer:${data.projectId}:${target.id}:${Date.now()}`,
    async () => {
      await dbHttp
        .update(projects)
        .set({ ownerUserId: target.id, updatedAt: new Date() })
        .where(eq(projects.id, data.projectId));
      return { newOwnerUserId: target.id };
    },
    { scope: `project:transfer:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "project.transfer",
    targetType: "project",
    targetId: data.projectId,
    metadata: {
      fromUserId: userId,
      toUserId: target.id,
      toGithubUsername: data.newOwnerGithubUsername,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}/settings`);
  await updateProjectCaches(data.projectId);
  return { ok: true, newOwnerUserId: result.newOwnerUserId };
}

// ---------------------------------------------------------------------------
// deleteProject — destructive. Marks killed; soft-delete only in v0.
// ---------------------------------------------------------------------------
const deleteSchema = z.object({
  projectId: z.string().min(1),
  /** User must type the slug to confirm. */
  confirmSlug: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function deleteProject(
  input: z.input<typeof deleteSchema>,
): Promise<{ ok: true }> {
  const data = deleteSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("project.delete", {
    userId,
    projectId: data.projectId,
  });

  const [proj] = await dbHttp
    .select({ ghOwner: projects.ghOwner, ghRepo: projects.ghRepo })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!proj) throw new Error("Project not found.");
  const slug = `${proj.ghOwner}/${proj.ghRepo}`;
  if (data.confirmSlug !== slug) {
    throw new Error(
      `Confirmation mismatch — type "${slug}" exactly to delete.`,
    );
  }

  await withIdempotency(
    data.idempotencyKey ?? `delete:${data.projectId}`,
    async () => {
      await dbHttp
        .update(projects)
        .set({
          status: "killed",
          killedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, data.projectId));
      return { ok: true } as const;
    },
    { scope: `project:delete:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "project.delete",
    targetType: "project",
    targetId: data.projectId,
    metadata: { slug },
  });

  revalidatePath("/dashboard");
  await updateProjectCaches(data.projectId, slug);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// updateMetadata — name/description/imageUrl
// ---------------------------------------------------------------------------
const updateMetadataSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable(),
  imageUrl: z.string().url().nullable(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function updateMetadata(
  input: z.input<typeof updateMetadataSchema>,
): Promise<{ ok: true }> {
  const data = updateMetadataSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("project.update", {
    userId,
    projectId: data.projectId,
  });

  const rl = await check("default", `meta:${userId}:${data.projectId}`);
  if (!rl.success) throw new Error("Rate limited — try again shortly.");

  await withIdempotency(
    data.idempotencyKey ?? `meta:${data.projectId}:${Date.now()}`,
    async () => {
      await dbHttp
        .update(projects)
        .set({
          name: data.name,
          description: data.description,
          imageUrl: data.imageUrl,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, data.projectId));
      return { ok: true } as const;
    },
    { scope: `project:metadata:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "project.update",
    targetType: "project",
    targetId: data.projectId,
    metadata: { kind: "metadata", name: data.name },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}/settings`);
  await updateProjectCaches(data.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// forceSnapshot — kicks the takeSnapshot workflow when present.
// ---------------------------------------------------------------------------
const forceSnapshotSchema = z.object({
  projectId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function forceSnapshot(
  input: z.input<typeof forceSnapshotSchema>,
): Promise<{ ok: true; runId: string | null }> {
  const data = forceSnapshotSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("snapshot.force", {
    userId,
    projectId: data.projectId,
  });

  const rl = await check("force-snapshot", `snap:${data.projectId}`);
  if (!rl.success) {
    throw new Error(
      "Force-snapshot is rate-limited to 1 per hour per project.",
    );
  }

  const runId: string | null = await withIdempotency(
    data.idempotencyKey ?? `snap:${data.projectId}:${Date.now()}`,
    async () => {
      const run = await start(takeProjectSnapshot, [data.projectId]);
      return run.runId ?? null;
    },
    { scope: `project:snapshot:force:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "snapshot.force",
    targetType: "project",
    targetId: data.projectId,
    metadata: { runId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath(`/dashboard/projects/${data.projectId}/leaderboard`);
  await updateProjectCaches(data.projectId);
  return { ok: true, runId };
}

// ---------------------------------------------------------------------------
// updateProjectDocs — owner-authored public project docs
// ---------------------------------------------------------------------------
const updateDocsSchema = z.object({
  projectId: z.string().min(1),
  markdown: z.string().max(20_000),
  published: z.boolean(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function updateProjectDocs(
  input: z.input<typeof updateDocsSchema>,
): Promise<{ ok: true }> {
  const data = updateDocsSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("project.update", {
    userId,
    projectId: data.projectId,
  });

  const rl = await check("default", `docs:${userId}:${data.projectId}`);
  if (!rl.success) throw new Error("Rate limited — try again shortly.");

  await withIdempotency(
    data.idempotencyKey ?? `docs:${data.projectId}:${Date.now()}`,
    async () => {
      const value = {
        markdown: data.markdown,
        published: data.published,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };
      await dbHttp
        .insert(platformConfig)
        .values({
          key: projectDocsKey(data.projectId),
          value,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: platformConfig.key,
          set: { value, updatedBy: userId, updatedAt: new Date() },
        });
      return { ok: true } as const;
    },
    { scope: `project:docs:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "project.docs_update",
    targetType: "project",
    targetId: data.projectId,
    metadata: {
      published: data.published,
      markdownLength: data.markdown.length,
    },
  });

  const [project] = await dbHttp
    .select({ ghOwner: projects.ghOwner, ghRepo: projects.ghRepo })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);

  revalidatePath(`/dashboard/projects/${data.projectId}/docs`);
  if (project) revalidatePath(`/r/${project.ghOwner}/${project.ghRepo}/docs`);
  await updateProjectCaches(data.projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Team membership — add/remove project moderators
// ---------------------------------------------------------------------------
const addMemberSchema = z.object({
  projectId: z.string().min(1),
  lookup: z.string().trim().min(1).max(120),
  role: z.literal("project_moderator").default("project_moderator"),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function addProjectMember(
  input: z.input<typeof addMemberSchema>,
): Promise<{ ok: true; userId: string }> {
  const data = addMemberSchema.parse(input);
  const userId = await requireSessionUserId();
  await requirePermission("team.invite", {
    userId,
    projectId: data.projectId,
  });

  const lookup = data.lookup.replace(/^@/, "");
  const [target] = await dbHttp
    .select({
      id: users.id,
      email: users.email,
      githubUsername: users.githubUsername,
    })
    .from(users)
    .where(or(eq(users.email, data.lookup), eq(users.githubUsername, lookup)))
    .limit(1);
  if (!target) {
    throw new Error("No GitShipt user found for that email or GitHub username.");
  }

  const [project] = await dbHttp
    .select({ ownerUserId: projects.ownerUserId })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found.");
  if (project.ownerUserId === target.id) {
    throw new Error("The project owner already has full access.");
  }

  await withIdempotency(
    data.idempotencyKey ?? `team:add:${data.projectId}:${target.id}`,
    async () => {
      await dbHttp
        .insert(projectMemberships)
        .values({
          userId: target.id,
          projectId: data.projectId,
          role: data.role,
        })
        .onConflictDoUpdate({
          target: [projectMemberships.userId, projectMemberships.projectId],
          set: { role: data.role },
        });
      return { ok: true, userId: target.id } as const;
    },
    { scope: `project:team:add:${data.projectId}:${userId}` },
  );

  await audit({
    actorUserId: userId,
    action: "team.member_add",
    targetType: "project",
    targetId: data.projectId,
    metadata: {
      targetUserId: target.id,
      role: data.role,
      email: target.email,
      githubUsername: target.githubUsername,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}/team`);
  await updateProjectCaches(data.projectId);
  return { ok: true, userId: target.id };
}

const removeMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function removeProjectMember(
  input: z.input<typeof removeMemberSchema>,
): Promise<{ ok: true }> {
  const data = removeMemberSchema.parse(input);
  const actorUserId = await requireSessionUserId();
  await requirePermission("team.revoke", {
    userId: actorUserId,
    projectId: data.projectId,
  });

  const [project] = await dbHttp
    .select({ ownerUserId: projects.ownerUserId })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found.");
  if (project.ownerUserId === data.userId) {
    throw new Error("Transfer ownership before removing the owner.");
  }

  await withIdempotency(
    data.idempotencyKey ?? `team:remove:${data.projectId}:${data.userId}`,
    async () => {
      await dbHttp
        .delete(projectMemberships)
        .where(
          and(
            eq(projectMemberships.projectId, data.projectId),
            eq(projectMemberships.userId, data.userId),
          ),
        );
      return { ok: true } as const;
    },
    { scope: `project:team:remove:${data.projectId}:${actorUserId}` },
  );

  await audit({
    actorUserId,
    action: "team.member_remove",
    targetType: "project",
    targetId: data.projectId,
    metadata: { targetUserId: data.userId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}/team`);
  await updateProjectCaches(data.projectId);
  return { ok: true };
}
