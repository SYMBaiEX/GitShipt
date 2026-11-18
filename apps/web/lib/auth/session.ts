import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";
import { hasCredentials } from "@/lib/env";
import { getAccountSettings } from "@/lib/queries/account";

type BetterAuthSession = Awaited<
  ReturnType<ReturnType<typeof auth>["api"]["getSession"]>
>;

export type AuthSessionWithUser = NonNullable<BetterAuthSession> & {
  user: NonNullable<NonNullable<BetterAuthSession>["user"]> & { id: string };
};

/**
 * Session-derived user shape consumed by `<PublicAppShell>` and the
 * `<AuthSidebar>` / `<UnauthSidebar>` switch inside it.
 *
 * Returns `null` when:
 *   - DB credentials are absent (stub mode)
 *   - No session cookie is present
 *   - Better-auth's getSession throws (network blip / cold start)
 *
 * Root layout resolves this once per request and seeds the client chrome
 * context. Shells can still call it directly when they need server-side
 * decisions, but sidebars should not re-fetch it per page.
 *
 * Implementation note: this helper is the single source of truth for
 * "who is the current user, formatted for chrome". Anything that needs
 * permission checks should still use `requirePermission()` / `hasPermission()`
 * directly with the user id from the underlying session lookup.
 */
export interface SessionUserChrome {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  imageUrl: string | null;
  defaultDashboardRoute?: string;
  isPlatformAdmin: boolean;
}

// Request-local deduplication across layouts, chrome and page guards.
const readAuthSession = cache(async (): Promise<AuthSessionWithUser | null> => {
  if (!hasCredentials.db()) return null;
  const session = await auth().api.getSession({ headers: await headers() });
  return session?.user?.id ? session : null;
});

export const getAuthSession = cache(() => readAuthSession().catch(() => null));

export const requireAuthSession = cache(
  async (next = "/dashboard"): Promise<AuthSessionWithUser> => {
    const session = await readAuthSession();
    if (!session?.user?.id) {
      redirect(`/auth/signin?next=${encodeURIComponent(next)}`);
    }
    return session;
  },
);

export const getSessionUser = cache(
  async (): Promise<SessionUserChrome | null> => {
    const session = await getAuthSession();
    if (!session?.user?.id) return null;

    const { id, role, name, email, image, githubUsername } = session.user;
    const settings = await getAccountSettings(id);
    return {
      id,
      name,
      email,
      imageUrl: image ?? null,
      username: githubUsername ?? null,
      defaultDashboardRoute: settings.defaultDashboardRoute,
      isPlatformAdmin: role === "admin" || role === "super_admin",
    };
  },
);
