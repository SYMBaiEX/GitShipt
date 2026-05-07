import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { dbHttp } from "@/db";
import { pendingAdminActions, users } from "@/db/schema";
import { audit, type AuditAction, type AuditEntry } from "@/lib/audit";
import { requirePermission, type Permission } from "./permissions";
import { getMfaConfirmedAt } from "./mfa";

/**
 * Critical action gate.
 *
 * Per PRD § "Critical action gates" + "Admin & permissions":
 *  - Reason string (min 20 chars) recorded with the audit entry.
 *  - MFA reverify within last 5 minutes (v0: timestamp-only stub; 
 *    enforces TOTP reverify on every call).
 *  - Confirmation modal: caller surfaces a typed-target check; we re-validate
 *    here so server cannot be bypassed by a manipulated client.
 *  - Audit log written BEFORE the action runs (so an action that throws still
 *    leaves a paper trail). On success / failure we emit a follow-up entry.
 *  - Reversibility cosign: irreversible actions persist a pending action and
 *    require a second super_admin to approve within 1 hour before execution.
 */

export interface DestructiveActionCosign {
  required: true;
  /**
   * First operator leaves this empty to create/reuse a pending action. The
   * approving super_admin submits the same destructive request with this id.
   */
  pendingActionId?: string;
  /**
   * Stable key from the caller's idempotency surface. Stored on the pending
   * row for auditability; the payload fingerprint enforces action equality.
   */
  idempotencyKey: string;
  expiresInMs?: number;
}

export interface DestructiveActionContext {
  actorUserId: string;
  permission: Permission; // checked via requirePermission
  projectId?: string;
  reason: string; // min 20 chars
  targetName: string; // e.g. project name; UI requires user to type this
  typedConfirmation: string; // user-typed value matching targetName
  mfaConfirmedAtMs?: number; // session-stored timestamp; must be < 5min ago
  ip?: string | null;
  userAgent?: string | null;
  cosign?: DestructiveActionCosign;
}

export interface AuditPayload {
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export type DestructiveErrorCode =
  | "reason_too_short"
  | "confirmation_mismatch"
  | "mfa_expired"
  | "mfa_required"
  | "cosign_required"
  | "cosign_invalid"
  | "cosign_expired"
  | "cosign_self_approval";

export class DestructiveActionError extends Error {
  readonly code: DestructiveErrorCode;
  constructor(code: DestructiveErrorCode, message?: string) {
    super(message ?? code);
    this.name = "DestructiveActionError";
    this.code = code;
  }
}

/**
 * Thrown when a destructive action is attempted without a fresh MFA
 * confirmation. Caller (typically a Server Action or API route) should
 * surface a re-verification prompt.
 */
export class MfaRequiredError extends DestructiveActionError {
  constructor(message = "Re-confirm MFA to continue") {
    super("mfa_required", message);
    this.name = "MfaRequiredError";
  }
}

export class PendingAdminActionError extends DestructiveActionError {
  readonly pendingActionId: string;
  readonly expiresAt: Date;

  constructor(pendingActionId: string, expiresAt: Date) {
    super(
      "cosign_required",
      `Second super_admin approval required. Pending action: ${pendingActionId}`,
    );
    this.name = "PendingAdminActionError";
    this.pendingActionId = pendingActionId;
    this.expiresAt = expiresAt;
  }
}

const MFA_WINDOW_MS = 5 * 60_000;
const REASON_MIN = 20;
const COSIGN_WINDOW_MS = 60 * 60_000;

interface ApprovedPendingAction {
  id: string;
  requestedBy: string;
  approvedBy: string;
  idempotencyKey: string;
}

interface DestructiveExecutionContext {
  /**
   * For cosigned actions this is the persisted pending-action idempotency key.
   * Use it for downstream external side-effect attempts so approval retries do
   * not create new money-moving attempts.
   */
  idempotencyKey?: string;
}

/**
 * Wrap any destructive admin operation. Validation order matches the spec
 * so the cheapest checks fail first and we never leak side-effects.
 */
export async function destructiveAction<T>(
  ctx: DestructiveActionContext,
  payload: AuditPayload,
  fn: (execution: DestructiveExecutionContext) => Promise<T>,
): Promise<T> {
  // 1. Permission re-check (also re-resolves the global role from DB).
  await requirePermission(ctx.permission, {
    userId: ctx.actorUserId,
    projectId: ctx.projectId,
  });

  // 2. Reason length.
  if (!ctx.reason || ctx.reason.trim().length < REASON_MIN) {
    throw new DestructiveActionError(
      "reason_too_short",
      `Reason must be at least ${REASON_MIN} characters.`,
    );
  }

  // 3. Typed-confirmation match (case-sensitive — matches what the UI shows).
  if (ctx.typedConfirmation !== ctx.targetName) {
    throw new DestructiveActionError(
      "confirmation_mismatch",
      "Typed confirmation does not match target.",
    );
  }

  // 4. MFA freshness check.
  // Hard-enforced: every destructive call must have a Redis-backed MFA
  // confirmation no older than MFA_WINDOW_MS. The optional
  // `ctx.mfaConfirmedAtMs` field on this struct is kept for telemetry only —
  // the source of truth lives in Redis (`mfa:confirmed:${userId}`), written
  // by POST /api/auth/mfa/verify after a fresh TOTP code is presented.
  // See lib/auth/mfa.ts for the helpers that maintain that key.
  const confirmedAtMs = await getMfaConfirmedAt(ctx.actorUserId);
  if (confirmedAtMs == null) {
    throw new MfaRequiredError();
  }
  const age = Date.now() - confirmedAtMs;
  if (age >= MFA_WINDOW_MS) {
    throw new DestructiveActionError(
      "mfa_expired",
      "MFA confirmation has expired. Please reverify.",
    );
  }
  // Surface the resolved value so audit metadata records the actual
  // confirmation that was used (not whatever the client claimed).
  ctx.mfaConfirmedAtMs = confirmedAtMs;

  // 5. Append-only audit BEFORE the action runs.
  const baseEntry: AuditEntry = {
    actorUserId: ctx.actorUserId,
    action: payload.action,
    targetType: payload.targetType,
    targetId: payload.targetId,
    metadata: {
      ...(payload.metadata ?? {}),
      reason: ctx.reason.trim(),
      destructive: true,
      phase: "preflight",
      mfaConfirmedAtMs: ctx.mfaConfirmedAtMs ?? null,
    },
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  };
  await audit(baseEntry);

  const approvedPendingAction = ctx.cosign?.required
    ? await requireCosignApproval(ctx, payload, baseEntry)
    : null;

  // 6. Execute. On success / failure emit a follow-up entry.
  try {
    const result = await fn({
      idempotencyKey: approvedPendingAction?.idempotencyKey,
    });
    if (approvedPendingAction) {
      await markPendingActionCompleted(approvedPendingAction.id);
    }
    await audit({
      ...baseEntry,
      metadata: {
        ...(baseEntry.metadata ?? {}),
        phase: "completed",
        pendingActionId: approvedPendingAction?.id,
        approvedBy: approvedPendingAction?.approvedBy,
      },
    });
    return result;
  } catch (e) {
    const err = e as Error;
    if (approvedPendingAction) {
      await markPendingActionFailed(
        approvedPendingAction.id,
        err?.message ?? String(e),
      );
    }
    await audit({
      ...baseEntry,
      metadata: {
        ...(baseEntry.metadata ?? {}),
        phase: "failed",
        error: err?.message ?? String(e),
        pendingActionId: approvedPendingAction?.id,
        approvedBy: approvedPendingAction?.approvedBy,
      },
    });
    throw e;
  }
}

async function requireCosignApproval(
  ctx: DestructiveActionContext,
  payload: AuditPayload,
  baseEntry: AuditEntry,
): Promise<ApprovedPendingAction> {
  const fingerprint = destructiveActionFingerprint(ctx, payload);
  const now = new Date();
  const pendingActionId = ctx.cosign?.pendingActionId?.trim();

  if (!pendingActionId) {
    const existing = await findOpenPendingAction(fingerprint);
    if (existing) {
      if (existing.expiresAt.getTime() <= now.getTime()) {
        await expirePendingAction(existing.id);
      } else {
        throw new PendingAdminActionError(existing.id, existing.expiresAt);
      }
    }

    const expiresAt = new Date(
      now.getTime() + (ctx.cosign?.expiresInMs ?? COSIGN_WINDOW_MS),
    );
    const [created] = await dbHttp
      .insert(pendingAdminActions)
      .values({
        fingerprint,
        idempotencyKey: ctx.cosign?.idempotencyKey ?? fingerprint,
        action: payload.action,
        permission: ctx.permission,
        targetType: payload.targetType,
        targetId: payload.targetId,
        projectId: ctx.projectId ?? null,
        actorUserId: ctx.actorUserId,
        reason: ctx.reason.trim(),
        targetName: ctx.targetName,
        payload: {
          action: payload.action,
          permission: ctx.permission,
          targetType: payload.targetType,
          targetId: payload.targetId,
          metadata: payload.metadata ?? {},
        },
        expiresAt,
      })
      .returning({
        id: pendingAdminActions.id,
        expiresAt: pendingAdminActions.expiresAt,
      });
    if (!created) {
      throw new DestructiveActionError(
        "cosign_invalid",
        "Could not create pending admin action.",
      );
    }

    await audit({
      ...baseEntry,
      metadata: {
        ...(baseEntry.metadata ?? {}),
        phase: "approval_requested",
        pendingActionId: created.id,
        expiresAt: created.expiresAt.toISOString(),
      },
    });
    throw new PendingAdminActionError(created.id, created.expiresAt);
  }

  const [pending] = await dbHttp
    .select({
      id: pendingAdminActions.id,
      actorUserId: pendingAdminActions.actorUserId,
      approverUserId: pendingAdminActions.approverUserId,
      idempotencyKey: pendingAdminActions.idempotencyKey,
      status: pendingAdminActions.status,
      fingerprint: pendingAdminActions.fingerprint,
      expiresAt: pendingAdminActions.expiresAt,
    })
    .from(pendingAdminActions)
    .where(eq(pendingAdminActions.id, pendingActionId))
    .limit(1);
  if (!pending || pending.status !== "pending") {
    throw new DestructiveActionError(
      "cosign_invalid",
      "Pending admin action is not approvable.",
    );
  }
  if (pending.expiresAt.getTime() <= now.getTime()) {
    await expirePendingAction(pending.id);
    await audit({
      ...baseEntry,
      metadata: {
        ...(baseEntry.metadata ?? {}),
        phase: "approval_expired",
        pendingActionId: pending.id,
      },
    });
    throw new DestructiveActionError(
      "cosign_expired",
      "Pending admin action approval window has expired.",
    );
  }
  if (pending.fingerprint !== fingerprint) {
    throw new DestructiveActionError(
      "cosign_invalid",
      "Pending admin action does not match this request.",
    );
  }
  if (pending.approverUserId) {
    if (pending.approverUserId !== ctx.actorUserId) {
      throw new DestructiveActionError(
        "cosign_invalid",
        "Pending admin action was already approved by another super_admin.",
      );
    }
    await requireSuperAdmin(ctx.actorUserId);
    await audit({
      ...baseEntry,
      metadata: {
        ...(baseEntry.metadata ?? {}),
        phase: "approval_resumed",
        pendingActionId: pending.id,
        requestedBy: pending.actorUserId,
        approvedBy: pending.approverUserId,
      },
    });
    return {
      id: pending.id,
      requestedBy: pending.actorUserId,
      approvedBy: pending.approverUserId,
      idempotencyKey: pending.idempotencyKey,
    };
  }
  if (pending.actorUserId === ctx.actorUserId) {
    throw new DestructiveActionError(
      "cosign_self_approval",
      "A different super_admin must approve irreversible admin actions.",
    );
  }

  await requireSuperAdmin(ctx.actorUserId);
  const [approved] = await dbHttp
    .update(pendingAdminActions)
    .set({
      approverUserId: ctx.actorUserId,
      approvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(pendingAdminActions.id, pending.id),
        eq(pendingAdminActions.status, "pending"),
        isNull(pendingAdminActions.approverUserId),
      ),
    )
    .returning({
      id: pendingAdminActions.id,
      actorUserId: pendingAdminActions.actorUserId,
      approverUserId: pendingAdminActions.approverUserId,
      idempotencyKey: pendingAdminActions.idempotencyKey,
    });
  if (!approved?.approverUserId) {
    throw new DestructiveActionError(
      "cosign_invalid",
      "Pending admin action approval could not be recorded.",
    );
  }

  await audit({
    ...baseEntry,
    metadata: {
      ...(baseEntry.metadata ?? {}),
      phase: "approved",
      pendingActionId: approved.id,
      requestedBy: approved.actorUserId,
      approvedBy: approved.approverUserId,
    },
  });
  return {
    id: approved.id,
    requestedBy: approved.actorUserId,
    approvedBy: approved.approverUserId,
    idempotencyKey: approved.idempotencyKey,
  };
}

async function findOpenPendingAction(
  fingerprint: string,
): Promise<{ id: string; expiresAt: Date } | null> {
  const [row] = await dbHttp
    .select({
      id: pendingAdminActions.id,
      expiresAt: pendingAdminActions.expiresAt,
    })
    .from(pendingAdminActions)
    .where(
      and(
        eq(pendingAdminActions.fingerprint, fingerprint),
        eq(pendingAdminActions.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function expirePendingAction(id: string): Promise<void> {
  const now = new Date();
  await dbHttp
    .update(pendingAdminActions)
    .set({ status: "expired", updatedAt: now })
    .where(eq(pendingAdminActions.id, id));
}

async function markPendingActionCompleted(id: string): Promise<void> {
  const now = new Date();
  await dbHttp
    .update(pendingAdminActions)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(eq(pendingAdminActions.id, id));
}

async function markPendingActionFailed(
  id: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  await dbHttp
    .update(pendingAdminActions)
    .set({
      status: "failed",
      failedAt: now,
      failureReason: reason.slice(0, 1_000),
      updatedAt: now,
    })
    .where(eq(pendingAdminActions.id, id));
}

async function requireSuperAdmin(userId: string): Promise<void> {
  const [row] = await dbHttp
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.role !== "super_admin") {
    throw new DestructiveActionError(
      "cosign_invalid",
      "Only a super_admin can approve irreversible admin actions.",
    );
  }
}

function destructiveActionFingerprint(
  ctx: DestructiveActionContext,
  payload: AuditPayload,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableForHash({
          permission: ctx.permission,
          projectId: ctx.projectId ?? null,
          targetName: ctx.targetName,
          action: payload.action,
          targetType: payload.targetType,
          targetId: payload.targetId,
          metadata: payload.metadata ?? {},
        }),
      ),
    )
    .digest("hex");
}

function stableForHash(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => stableForHash(item));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, stableForHash(entryValue)]),
    );
  }
  return value;
}
