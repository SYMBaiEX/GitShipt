// Side-effect import: registers the global AsyncLocalStorage instance the
// RLS context layer reads from. Auth is loaded by every server-side path
// that needs user-mode context propagation (Server Components, route
// handlers, server actions), so importing it here is the most reliable
// place to ensure storage is ready before `enterRlsContext` runs.
import "@/db/rls-storage-init";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { dbPool } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv, hasCredentials } from "@/lib/env";
import { establishDbUserContext, enterDbAnonymousContext } from "@/lib/db-rls";

function adminEmailAllowlist(): Set<string> {
  const raw = serverEnv().ADMIN_EMAIL_ALLOWLIST;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * better-auth instance. Boots lazily so the app can render in stub mode
 * without GitHub OAuth credentials configured.
 *
 * Notes:
 *  - We use the pool driver here so multi-step auth flows (for example,
 *    account-linking + session) run inside one transaction.
 *  - Session cookies are HttpOnly + Secure + SameSite=Lax (better-auth defaults).
 *  - GitHub access tokens are persisted in `accounts.access_token` for use
 *    by Octokit when the user-context API surface is needed.
 *
 * Type holes: `_authCache` is loosely typed because better-auth's return
 * type narrows on `additionalFields`, which is awkward to express in a
 * cache slot. We cast on read; the runtime shape is unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _authCache: any = null;

function buildOptions(): BetterAuthOptions {
  const env = serverEnv();
  // Skip strict validation during build time - the fallback secret handles missing values
  // Runtime checks in production will catch actual misconfiguration
  return {
    database: drizzleAdapter(dbPool(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret:
      env.BETTER_AUTH_SECRET ??
      "dev-only-32-byte-secret-do-not-use-in-prod-1234",
    baseURL:
      env.BETTER_AUTH_URL ??
      (env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
    socialProviders: hasCredentials.github()
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID!,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
            scope: ["read:user", "user:email"],
          },
        }
      : {},
    user: {
      additionalFields: {
        githubId: { type: "string", required: false },
        githubUsername: { type: "string", required: false },
        role: { type: "string", required: true, defaultValue: "user" },
      },
    },
    advanced: {
      cookies: {
        sessionToken: {
          attributes: { sameSite: "lax", secure: true, httpOnly: true },
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const email = (user as { email?: string }).email;
            if (!email) return;
            if (!adminEmailAllowlist().has(email.toLowerCase())) return;
            await dbPool()
              .update(schema.users)
              .set({ role: "super_admin" })
              .where(eq(schema.users.id, (user as { id: string }).id));
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export function auth(): ReturnType<typeof betterAuth> {
  if (_authCache) return _authCache;
  const instance = betterAuth(buildOptions());
  const originalGetSession = instance.api.getSession.bind(instance.api);
  instance.api.getSession = (async (
    ...args: Parameters<typeof originalGetSession>
  ) => {
    const session = await originalGetSession(...args);
    if (session?.user?.id) {
      await establishDbUserContext(session.user.id, "better-auth-session");
    } else {
      enterDbAnonymousContext("better-auth-empty-session");
    }
    return session;
  }) as typeof originalGetSession;
  _authCache = instance;
  return _authCache;
}

export type Auth = ReturnType<typeof auth>;
