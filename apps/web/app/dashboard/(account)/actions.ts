"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbHttp } from "@/db";
import { userSettings, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { updateUserCaches } from "@/lib/cache-actions";
import { withIdempotency } from "@/lib/idempotency";
import { withUserDb } from "@/lib/db-rls";
import { check } from "@/lib/rate-limit";
import { syncGitHubIdentityForUser } from "@/lib/queries/account";

const OptionalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .url()
      .max(500)
      .refine((value) => {
        const hostname = new URL(value).hostname;
        return (
          hostname === "avatars.githubusercontent.com" ||
          hostname === "github.com" ||
          hostname.endsWith(".githubusercontent.com")
        );
      }, "Use a GitHub or GitHubusercontent avatar URL.")
      .nullable(),
  );

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  imageUrl: OptionalUrlSchema,
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const UpdateSettingsSchema = z.object({
  payoutEmails: z.boolean(),
  securityEmails: z.boolean(),
  productEmails: z.boolean(),
  compactMode: z.boolean(),
  defaultDashboardRoute: z.enum([
    "/dashboard",
    "/dashboard/projects",
    "/dashboard/earnings",
    "/dashboard/wallets",
  ]),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const SyncGithubSchema = z.object({
  idempotencyKey: z.string().min(8).max(128).optional(),
});

async function requireAccountMutationContext(): Promise<{
  userId: string;
  ip: string | null;
  userAgent: string | null;
}> {
  const headerList = await headers();
  const session = await auth().api.getSession({ headers: headerList });
  if (!session?.user?.id) redirect("/auth/signin");

  const userId = session.user.id;
  await requirePermission("account.update", { userId });

  return {
    userId,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  };
}

function refreshAccountRoutes(): void {
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/security");
}

export async function updateAccountProfile(
  input: z.input<typeof UpdateProfileSchema>,
): Promise<{ ok: true }> {
  const data = UpdateProfileSchema.parse(input);
  const ctx = await requireAccountMutationContext();

  const rl = await check("default", `account-profile:${ctx.userId}`);
  if (!rl.success) throw new Error("Rate limited. Try again shortly.");

  await withIdempotency(
    data.idempotencyKey ?? `profile:${ctx.userId}:${Date.now()}`,
    () =>
      withUserDb(ctx.userId, "account:update-profile", async () => {
        await dbHttp
          .update(users)
          .set({
            name: data.name,
            image: data.imageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.userId));

        await audit({
          actorUserId: ctx.userId,
          action: "user.profile_update",
          targetType: "user",
          targetId: ctx.userId,
          metadata: { changed: ["name", "image"] },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return { ok: true } as const;
      }),
    { scope: `account:profile:${ctx.userId}` },
  );

  refreshAccountRoutes();
  await updateUserCaches(ctx.userId);
  return { ok: true };
}

export async function updateAccountSettings(
  input: z.input<typeof UpdateSettingsSchema>,
): Promise<{ ok: true }> {
  const data = UpdateSettingsSchema.parse(input);
  const ctx = await requireAccountMutationContext();

  const rl = await check("default", `account-settings:${ctx.userId}`);
  if (!rl.success) throw new Error("Rate limited. Try again shortly.");

  await withIdempotency(
    data.idempotencyKey ?? `settings:${ctx.userId}:${Date.now()}`,
    () =>
      withUserDb(ctx.userId, "account:update-settings", async () => {
        const now = new Date();
        await dbHttp
          .insert(userSettings)
          .values({
            userId: ctx.userId,
            payoutEmails: data.payoutEmails,
            securityEmails: data.securityEmails,
            productEmails: data.productEmails,
            compactMode: data.compactMode,
            defaultDashboardRoute: data.defaultDashboardRoute,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              payoutEmails: data.payoutEmails,
              securityEmails: data.securityEmails,
              productEmails: data.productEmails,
              compactMode: data.compactMode,
              defaultDashboardRoute: data.defaultDashboardRoute,
              updatedAt: now,
            },
          });

        await audit({
          actorUserId: ctx.userId,
          action: "user.settings_update",
          targetType: "user",
          targetId: ctx.userId,
          metadata: {
            payoutEmails: data.payoutEmails,
            securityEmails: data.securityEmails,
            productEmails: data.productEmails,
            compactMode: data.compactMode,
            defaultDashboardRoute: data.defaultDashboardRoute,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return { ok: true } as const;
      }),
    { scope: `account:settings:${ctx.userId}` },
  );

  refreshAccountRoutes();
  await updateUserCaches(ctx.userId);
  return { ok: true };
}

export async function refreshGithubIdentity(
  input: z.input<typeof SyncGithubSchema>,
): Promise<{ ok: true; githubUsername: string }> {
  const data = SyncGithubSchema.parse(input);
  const ctx = await requireAccountMutationContext();

  const rl = await check("default", `account-github-sync:${ctx.userId}`);
  if (!rl.success) throw new Error("Rate limited. Try again shortly.");

  const result = await withIdempotency(
    data.idempotencyKey ?? `github-sync:${ctx.userId}:${Date.now()}`,
    () =>
      withUserDb(ctx.userId, "account:sync-github", async () => {
        const identity = await syncGitHubIdentityForUser(ctx.userId);

        await audit({
          actorUserId: ctx.userId,
          action: "user.github_sync",
          targetType: "user",
          targetId: ctx.userId,
          metadata: { githubUsername: identity.githubUsername },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });

        return {
          ok: true,
          githubUsername: identity.githubUsername,
        } as const;
      }),
    { scope: `account:github-sync:${ctx.userId}` },
  );

  refreshAccountRoutes();
  await updateUserCaches(ctx.userId);
  return result;
}
