import "server-only";
import { Octokit } from "@octokit/rest";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { dbHttp } from "@/db";
import { accounts, sessions, userSettings, users } from "@/db/schema";
import { cacheLife, cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache";
import { withUserDb } from "@/lib/db-rls";
import "@/db/rls-storage-init";

const UserRoleSchema = z.enum(["user", "moderator", "admin", "super_admin"]);
const GitHubViewerSchema = z.object({
  login: z.string().min(1),
  id: z.number().int().positive(),
  avatar_url: z.string().url(),
});
const DefaultDashboardRouteSchema = z.enum([
  "/dashboard",
  "/dashboard/projects",
  "/dashboard/earnings",
  "/dashboard/wallets",
]);

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return toDate(value);
}

async function fetchGitHubViewer(accessToken: string): Promise<{
  id: string;
  login: string;
  avatarUrl: string;
} | null> {
  try {
    const { data } = await new Octokit({ auth: accessToken }).request(
      "GET /user",
    );
    const parsed = GitHubViewerSchema.parse(data);
    return {
      id: String(parsed.id),
      login: parsed.login,
      avatarUrl: parsed.avatar_url,
    };
  } catch (error) {
    console.warn("[account:github-viewer] fetch failed", error);
    return null;
  }
}

export async function syncGitHubIdentityForUser(
  userId: string,
  options: { overwriteImage?: boolean } = {},
): Promise<{
  githubId: string;
  githubUsername: string;
  image: string;
}> {
  const [githubAccount] = await dbHttp
    .select({
      accessToken: accounts.accessToken,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "github")))
    .orderBy(desc(accounts.createdAt))
    .limit(1);

  if (!githubAccount?.accessToken) {
    throw new Error("No GitHub OAuth token is linked to this account.");
  }

  const viewer = await fetchGitHubViewer(githubAccount.accessToken);
  if (!viewer) {
    throw new Error("Could not refresh GitHub identity.");
  }

  await dbHttp
    .update(users)
    .set({
      githubId: viewer.id,
      githubUsername: viewer.login,
      ...(options.overwriteImage === false ? {} : { image: viewer.avatarUrl }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return {
    githubId: viewer.id,
    githubUsername: viewer.login,
    image: viewer.avatarUrl,
  };
}

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  githubId: string | null;
  githubUsername: string | null;
  githubConnected: boolean;
  role: "user" | "moderator" | "admin" | "super_admin";
  createdAt: Date;
  updatedAt: Date;
  githubConnectedAt: Date | null;
  activeSessionCount: number;
}

export interface AccountSecurityState {
  mfaEnrolled: boolean;
  activeSessionCount: number;
  githubConnected: boolean;
  emailVerified: boolean;
}

export interface AccountSettings {
  payoutEmails: boolean;
  securityEmails: boolean;
  productEmails: boolean;
  compactMode: boolean;
  defaultDashboardRoute: z.infer<typeof DefaultDashboardRouteSchema>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  payoutEmails: true,
  securityEmails: true,
  productEmails: false,
  compactMode: false,
  defaultDashboardRoute: "/dashboard",
  createdAt: null,
  updatedAt: null,
};

async function getAccountProfileUncached(
  userId: string,
): Promise<AccountProfile | null> {
  const [row, githubAccount] = await Promise.all([
    dbHttp
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        githubId: users.githubId,
        githubUsername: users.githubUsername,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        activeSessionCount: sql<number>`(
          select count(*)::int
          from ${sessions}
          where ${sessions.userId} = ${users.id}
            and ${sessions.expiresAt} > now()
        )`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then(([profile]) => profile ?? null),
    dbHttp
      .select({
        accountId: accounts.accountId,
        accessToken: accounts.accessToken,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(
        and(eq(accounts.userId, userId), eq(accounts.providerId, "github")),
      )
      .orderBy(desc(accounts.createdAt))
      .limit(1)
      .then(([account]) => account ?? null),
  ]);

  if (!row) return null;

  let image = row.image;
  let githubId = row.githubId ?? githubAccount?.accountId ?? null;
  let githubUsername = row.githubUsername;
  let updatedAt = toDate(row.updatedAt);

  if (
    (!githubUsername || !row.githubId || !image) &&
    githubAccount?.accessToken
  ) {
    try {
      const viewer = await syncGitHubIdentityForUser(userId, {
        overwriteImage: !row.image,
      });
      image = row.image ?? viewer.image;
      githubId = row.githubId ?? viewer.githubId;
      githubUsername = row.githubUsername ?? viewer.githubUsername;
      if (!row.image || !row.githubId || !row.githubUsername) {
        updatedAt = new Date();
      }
    } catch {
      // The account is still linked even if GitHub is temporarily unavailable.
    }
  }

  return {
    ...row,
    image,
    githubId,
    githubUsername,
    githubConnected: Boolean(githubAccount),
    role: UserRoleSchema.parse(row.role),
    createdAt: toDate(row.createdAt),
    updatedAt,
    githubConnectedAt: toNullableDate(githubAccount?.createdAt ?? null),
    activeSessionCount: row.activeSessionCount ?? 0,
  };
}

export async function getAccountProfile(
  userId: string,
): Promise<AccountProfile | null> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return withUserDb(userId, "account:profile", () => getAccountProfileUncached(userId));
}

async function getAccountSecurityStateUncached(
  userId: string,
): Promise<AccountSecurityState | null> {
  const [row] = await dbHttp
    .select({
      mfaSecretEnc: users.mfaSecretEnc,
      emailVerified: users.emailVerified,
      githubConnected: sql<boolean>`exists (
        select 1
        from ${accounts}
        where ${accounts.userId} = ${users.id}
          and ${accounts.providerId} = 'github'
      )`,
      activeSessionCount: sql<number>`(
        select count(*)::int
        from ${sessions}
        where ${sessions.userId} = ${users.id}
          and ${sessions.expiresAt} > now()
      )`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  return {
    mfaEnrolled: Boolean(row.mfaSecretEnc),
    activeSessionCount: row.activeSessionCount ?? 0,
    githubConnected: Boolean(row.githubConnected),
    emailVerified: row.emailVerified,
  };
}

export async function getAccountSecurityState(
  userId: string,
): Promise<AccountSecurityState | null> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return withUserDb(userId, "account:security", () => getAccountSecurityStateUncached(userId));
}

async function getAccountSettingsUncached(
  userId: string,
): Promise<AccountSettings> {
  const [row] = await dbHttp
    .select({
      payoutEmails: userSettings.payoutEmails,
      securityEmails: userSettings.securityEmails,
      productEmails: userSettings.productEmails,
      compactMode: userSettings.compactMode,
      defaultDashboardRoute: userSettings.defaultDashboardRoute,
      createdAt: userSettings.createdAt,
      updatedAt: userSettings.updatedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_ACCOUNT_SETTINGS;

  return {
    payoutEmails: row.payoutEmails,
    securityEmails: row.securityEmails,
    productEmails: row.productEmails,
    compactMode: row.compactMode,
    defaultDashboardRoute: DefaultDashboardRouteSchema.catch("/dashboard").parse(
      row.defaultDashboardRoute,
    ),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  "use cache";
  cacheLife("auth");
  cacheTag(cacheTags.dashboard);
  cacheTag(cacheTags.user(userId));
  cacheTag(cacheTags.dashboardUser(userId));
  return withUserDb(userId, "account:settings", () => getAccountSettingsUncached(userId));
}
