import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleServerless } from "drizzle-orm/neon-serverless";
import { neon, Pool } from "@neondatabase/serverless";
import { databaseUrl, databaseUrlUnpooled } from "@/lib/env";
import * as schema from "./schema";
import { createRlsNeonClient, pgServiceOptions } from "./rls-context";

type DbHttp = ReturnType<typeof drizzleHttp<typeof schema>>;
type DbPool = ReturnType<typeof drizzleServerless<typeof schema>>;

/**
 * Neon-only DB client. Postgres-js fallback for non-Neon hosts (Supabase,
 * generic Postgres) was removed when the Workflow DevKit's bundler started
 * rejecting transitive Node-module imports from helper files. Re-add the
 * branch with a lazy `await import("postgres")` if you need it; for now,
 * production and development both run on Neon's serverless drivers, which
 * have no Node-only deps and are sandbox-safe.
 */
function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function nonNeonMessage(url: string): string {
  return (
    `[db] DATABASE_URL must be a Neon (.neon.tech) host; got "${url}". ` +
    "Non-Neon Postgres support was removed when Workflow DevKit integration " +
    "blocked the static `postgres` import. Provision a Neon database via " +
    "Vercel Marketplace or re-add the postgres-js path with a lazy import."
  );
}

function lazyError<T extends object>(message: string): T {
  return new Proxy({} as T, {
    get() {
      throw new Error(message);
    },
  }) as T;
}

const httpUrl = databaseUrl();

// `dbHttp` is referenced at module-evaluation time across many entry points
// (Server Actions, route handlers, queries). Throwing eagerly here breaks
// `next build`'s page-data collection step on environments that have a
// non-Neon URL set. Defer both error paths to first property access; that
// way the build completes cleanly and the actual error fires only when
// some caller tries to query.
export const dbHttp: DbHttp = httpUrl
  ? isNeonUrl(httpUrl)
    ? drizzleHttp(createRlsNeonClient(neon(httpUrl)), { schema })
    : lazyError<DbHttp>(nonNeonMessage(httpUrl))
  : lazyError<DbHttp>(
      "DATABASE_URL is not configured. Provision a Neon database via Vercel Marketplace.",
    );

let _dbPool: DbPool | null = null;

export function dbPool(): DbPool {
  if (_dbPool) return _dbPool;
  const connectionString = databaseUrlUnpooled();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED or DATABASE_URL is not configured.",
    );
  }
  if (!isNeonUrl(connectionString)) {
    throw new Error(nonNeonMessage(connectionString));
  }
  const pool = new Pool({
    connectionString,
    options: pgServiceOptions(),
  });
  _dbPool = drizzleServerless(pool, { schema });
  return _dbPool;
}

export { schema };
