import { redis } from "@/lib/redis";
import { dbHttp } from "@/db";
import { sql } from "drizzle-orm";
import { hasCredentials, productionReadiness, serverEnv } from "@/lib/env";
import { noStoreJson } from "@/lib/no-store-response";


/**
 * Lightweight health check. Probes:
 *  - DB connectivity (SELECT 1)
 *  - Redis connectivity (PING)
 *  - Env presence for each external service
 *
 * Always returns 200 with a JSON body so monitoring can parse the
 * sub-statuses; only the HTTP layer being reachable is the "up" signal.
 */
export async function GET(req: Request): Promise<Response> {
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  const status: Record<string, "ok" | "stub" | "fail"> = {
    db: "stub",
    redis: "stub",
    bags: hasCredentials.bags() ? "ok" : "stub",
    bagsPartner: hasCredentials.bagsPartner() ? "ok" : "stub",
    github: hasCredentials.github() ? "ok" : "stub",
    githubApp: hasCredentials.githubApp() ? "ok" : "stub",
    solana: hasCredentials.solana() ? "ok" : "stub",
    payoutKey: hasCredentials.payoutKey() ? "ok" : "stub",
    managerKey: hasCredentials.managerKey() ? "ok" : "stub",
    heliusWebhook: hasCredentials.heliusWebhook() ? "ok" : "stub",
    cron: hasCredentials.cron() ? "ok" : "stub",
  };

  if (hasCredentials.db()) {
    try {
      await dbHttp.execute(sql`select 1`);
      status.db = "ok";
    } catch {
      status.db = "fail";
    }
  }

  const r = redis();
  if (r) {
    try {
      const pong = await r.ping();
      status.redis = pong === "PONG" ? "ok" : "fail";
    } catch {
      status.redis = "fail";
    }
  } else {
    status.redis = "stub";
  }

  const production = productionReadiness();
  if (!production.ok && production.mode === "production") {
    status.production = "fail";
  } else {
    status.production = "ok";
  }

  const env = serverEnv();
  const overrides = {
    emergencyKillSwitch: env.EMERGENCY_KILL_SWITCH,
    killSwitchEnabled: env.KILL_SWITCH_ENABLED,
    allowStubsInProd: env.ALLOW_STUBS_IN_PROD,
    allowDemoSeed: env.ALLOW_DEMO_SEED,
    allowNonNeonRlsOff: env.ALLOW_NON_NEON_RLS_OFF,
    bagsAllowProdLaunch: env.BAGS_ALLOW_PROD_LAUNCH,
  };
  const stubMode = Object.fromEntries(
    Object.entries(status)
      .filter(([key]) => key !== "production")
      .map(([key, value]) => [key, value === "stub"]),
  );

  const ok = !Object.values(status).some((v) => v === "fail");
  const strictOk =
    ok &&
    production.ok &&
    !Object.entries(stubMode).some(([, value]) => value === true);

  return noStoreJson(
    {
      ok: strict ? strictOk : ok,
      strict,
      status,
      production,
      overrides,
      stubMode,
      at: new Date().toISOString(),
    },
    strict && !strictOk ? { status: 503 } : undefined,
  );
}
