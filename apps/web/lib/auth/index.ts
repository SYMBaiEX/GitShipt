// Session callers scope their own database work to the verified principal.
import "@/db/rls-storage-init";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { dbPool } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv, hasCredentials } from "@/lib/env";

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
 */

function makeAuth() {
  const env = serverEnv();
  // Skip strict validation during build time - the fallback secret handles missing values
  // Runtime checks in production will catch actual misconfiguration
  return betterAuth({
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
        githubId: { type: "string", required: false, input: false },
        githubUsername: { type: "string", required: false, input: false },
        role: {
          type: "string",
          required: true,
          defaultValue: "user",
          input: false,
        },
      },
    },
    advanced: {
      cookies: {
        sessionToken: {
          attributes: { sameSite: "lax", secure: true, httpOnly: true },
        },
      },
    },
  } satisfies BetterAuthOptions);
}

let authInstance: ReturnType<typeof makeAuth> | undefined;

export function auth() {
  return (authInstance ??= makeAuth());
}

export type Auth = ReturnType<typeof auth>;
