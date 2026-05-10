import { dbHttp } from "@/db";
import { projectMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { establishDbUserContext, withDbServiceContext } from "@/lib/db-rls";

export type GlobalRole = "user" | "moderator" | "admin" | "super_admin";
export type ProjectRole = "project_owner" | "project_moderator";

export type Permission =
  // Account resource
  | "account.update"
  // Project resource
  | "project.read"
  | "project.update"
  | "project.delete"
  | "project.transfer"
  | "project.pause"
  | "project.kill"
  // Scoring + payouts
  | "scoring.read"
  | "scoring.update"
  | "payouts.read"
  | "payouts.trigger"
  | "payouts.cancel"
  | "payouts.retry"
  // Project team
  | "team.invite"
  | "team.revoke"
  | "snapshot.force"
  // Platform-wide
  | "platform.fees.update"
  | "platform.treasury.read"
  | "platform.treasury.claim"
  | "platform.treasury.topup"
  | "platform.kill_switch"
  | "platform.maintenance"
  | "admin.access"
  | "admin.direct_launch"
  | "admin.users.role.grant"
  | "admin.audit.read"
  | "admin.workflows.inspect";

/**
 * Authoritative permission matrix.
 * Project-scoped permissions accept either a global role or the matching
 * project-membership role. Platform permissions only accept global roles.
 */
const PERMISSIONS: Record<
  Permission,
  ReadonlyArray<GlobalRole | ProjectRole>
> = {
  "account.update": ["user", "moderator", "admin", "super_admin"],

  "project.read": [
    "project_moderator",
    "project_owner",
    "moderator",
    "admin",
    "super_admin",
  ],
  "project.update": ["project_owner", "admin", "super_admin"],
  "project.delete": ["project_owner", "super_admin"],
  "project.transfer": ["project_owner", "super_admin"],
  "project.pause": ["project_owner", "admin", "super_admin"],
  "project.kill": ["super_admin"],

  "scoring.read": [
    "project_moderator",
    "project_owner",
    "admin",
    "super_admin",
  ],
  "scoring.update": ["project_owner", "super_admin"],

  "payouts.read": [
    "project_owner",
    "project_moderator",
    "admin",
    "super_admin",
  ],
  "payouts.trigger": ["project_owner", "super_admin"],
  "payouts.cancel": ["super_admin"],
  "payouts.retry": ["project_owner", "admin", "super_admin"],

  "team.invite": ["project_owner", "super_admin"],
  "team.revoke": ["project_owner", "super_admin"],
  "snapshot.force": ["project_owner", "super_admin"],

  "platform.fees.update": ["super_admin"],
  "platform.treasury.read": ["admin", "super_admin"],
  "platform.treasury.claim": ["super_admin"],
  "platform.treasury.topup": ["super_admin"],
  "platform.kill_switch": ["super_admin"],
  "platform.maintenance": ["super_admin"],
  "admin.access": ["admin", "super_admin"],
  "admin.direct_launch": ["super_admin"],
  "admin.users.role.grant": ["super_admin"],
  "admin.audit.read": ["admin", "super_admin"],
  "admin.workflows.inspect": ["admin", "super_admin"],
};

export class PermissionError extends Error {
  readonly code = "PERMISSION_DENIED";
  constructor(
    public readonly permission: Permission,
    public readonly userId: string | null,
    public readonly projectId?: string,
  ) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionError";
  }
}

export interface PermissionContext {
  userId: string;
  projectId?: string;
}

/**
 * Throws `PermissionError` if the user (and optional project membership)
 * lacks the requested permission.
 *
 * Always re-resolves the global role from DB on each call — never trust a
 * client-supplied role. Project-scoped permissions also check
 * `project_memberships(user_id, project_id)`.
 */
export async function requirePermission(
  permission: Permission,
  ctx: PermissionContext,
): Promise<void> {
  const allowed = PERMISSIONS[permission];

  const [user] = await withDbServiceContext(
    "require-permission:user-role",
    () =>
      dbHttp
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1),
  );
  if (!user) throw new PermissionError(permission, ctx.userId, ctx.projectId);
  await establishDbUserContext(ctx.userId, `permission:${permission}`);

  if (allowed.includes(user.role)) return;

  const projectId = ctx.projectId;
  if (projectId) {
    const [membership] = await withDbServiceContext(
      "require-permission:project-membership",
      () =>
        dbHttp
          .select({ role: projectMemberships.role })
          .from(projectMemberships)
          .where(
            and(
              eq(projectMemberships.userId, ctx.userId),
              eq(projectMemberships.projectId, projectId),
            ),
          )
          .limit(1),
    );
    if (membership && allowed.includes(membership.role)) return;
  }

  throw new PermissionError(permission, ctx.userId, ctx.projectId);
}

/** Non-throwing variant. */
export async function hasPermission(
  permission: Permission,
  ctx: PermissionContext,
): Promise<boolean> {
  try {
    await requirePermission(permission, ctx);
    return true;
  } catch (e) {
    if (e instanceof PermissionError) return false;
    throw e;
  }
}
