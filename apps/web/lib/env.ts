import { z } from "zod";

export const DEFAULT_BAGS_PARTNER_WALLET =
  "HXs58Qa6YtgJfWVkQVnpFmw6WoEdFEL4LLD1ArZjMvTH";
export const DEFAULT_BAGS_REF_CODE = "symbiex";

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database
  DATABASE_URL: optionalUrl,
  DATABASE_URL_UNPOOLED: optionalUrl,
  DATABASE_POSTGRES_URL: optionalUrl,
  DATABASE_POSTGRES_PRISMA_URL: optionalUrl,
  DATABASE_POSTGRES_URL_NON_POOLING: optionalUrl,
  POSTGRES_URL: optionalUrl,
  POSTGRES_URL_NON_POOLING: optionalUrl,
  POSTGRES_PRISMA_URL: optionalUrl,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SECRET_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  // Redis (any provider speaking standard Redis protocol — Redis Cloud,
  // Upstash, Dragonfly, self-hosted). Format: redis://[user]:[pass]@host:port
  REDIS_URL: optionalString,
  UPSTASH_REDIS_REST_REDIS_URL: optionalString,

  // Auth
  BETTER_AUTH_SECRET: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  BETTER_AUTH_URL: optionalUrl,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_APP_WEBHOOK_SECRET: optionalString,
  GITHUB_APP_SLUG: optionalString,

  // Bags.fm
  BAGS_API_KEY: optionalString,
  BAGS_API_BASE_URL: z
    .string()
    .url()
    .default("https://public-api-v2.bags.fm/api/v1/"),
  BAGS_WEBHOOK_SECRET: optionalString,
  BAGS_PARTNER_WALLET: z.string().min(32).default(DEFAULT_BAGS_PARTNER_WALLET),
  BAGS_PARTNER_CONFIG_KEY: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).optional(),
  ),
  BAGS_REF_CODE: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default(DEFAULT_BAGS_REF_CODE),
  BAGS_CONFIG_TYPE: optionalString,
  BAGS_INITIAL_BUY_LAMPORTS: z.coerce.number().int().min(0).default(0),
  // Safety guard: refuse real launch txns when devnet cluster + prod key
  // unless explicitly opted in. Read-only Bags calls always work.
  BAGS_ALLOW_PROD_LAUNCH: z.coerce.boolean().default(false),
  ALLOW_STUBS_IN_PROD: z.coerce.boolean().default(false),

  // Solana
  HELIUS_RPC_URL: optionalUrl,
  SOLANA_PAYOUT_KEYPAIR: optionalString,
  SOLANA_TREASURY_ADDRESS: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).optional(),
  ),

  // Cron
  // Generate with: openssl rand -base64 32
  // Compared via crypto.timingSafeEqual at the cron edge.
  CRON_SECRET: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).optional(),
  ),

  // Idempotency: HMAC key for tamper-evident replay cache. Without it, the
  // idempotency cache stores values verbatim and a leaked key replays the
  // cached response. With it, every cached value carries an HMAC bound to
  // (scope|key|sha256(payload)) and mismatched reads are rejected.
  // Generate with: openssl rand -base64 32
  IDEMPOTENCY_KEY_SECRET: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(32).optional(),
  ),

  // Platform
  PLATFORM_FEE_BPS_DEFAULT: z.coerce
    .number()
    .int()
    .min(200)
    .max(10_000)
    .default(500),
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
  KILL_SWITCH_ENABLED: z.coerce.boolean().default(false),

  // Out-of-band emergency stop. When true, every entry into trading-controls
  // returns halted=true regardless of the platform_config DB row. Use during
  // an incident when the DB itself may be unhealthy.
  EMERGENCY_KILL_SWITCH: z.coerce.boolean().default(false),

  // Hard gate on the demo seeder. Refuses to run unless explicitly allowed
  // AND NODE_ENV is non-production.
  ALLOW_DEMO_SEED: z.coerce.boolean().default(false),

  // Allow non-Neon DATABASE_URL in production (RLS becomes app-only). Off by
  // default; set true only with a documented mitigation plan.
  ALLOW_NON_NEON_RLS_OFF: z.coerce.boolean().default(false),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl.default("http://localhost:3000"),
  NEXT_PUBLIC_SOLANA_CLUSTER: z
    .enum(["devnet", "testnet", "mainnet-beta"])
    .default("devnet"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cachedServer: ServerEnv | null = null;
let cachedClient: ClientEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[env] Server env validation failed:",
      parsed.error.flatten(),
    );
    throw new Error("Invalid server environment");
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function clientEnv(): ClientEnv {
  if (cachedClient) return cachedClient;
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  });
  if (!parsed.success) {
    console.error(
      "[env] Client env validation failed:",
      parsed.error.flatten(),
    );
    throw new Error("Invalid client environment");
  }
  cachedClient = parsed.data;
  return cachedClient;
}

function isNeonHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export const hasCredentials = {
  // The runtime db client refuses non-Neon URLs (Workflow DevKit dropped the
  // postgres-js path), so a configured-but-non-Neon URL behaves like an
  // unconfigured one for every callsite that uses this guard. Reflect that
  // here so prerender-time fallbacks render instead of throwing.
  db: () => {
    const url = databaseUrl();
    return Boolean(url) && isNeonHost(url!);
  },
  redis: () => Boolean(redisUrl()),
  github: () =>
    Boolean(serverEnv().GITHUB_CLIENT_ID && serverEnv().GITHUB_CLIENT_SECRET),
  githubApp: () =>
    Boolean(
      serverEnv().GITHUB_APP_ID &&
      serverEnv().GITHUB_APP_PRIVATE_KEY &&
      serverEnv().GITHUB_APP_WEBHOOK_SECRET,
    ),
  bags: () => Boolean(serverEnv().BAGS_API_KEY),
  bagsWebhook: () => Boolean(serverEnv().BAGS_WEBHOOK_SECRET),
  bagsPartner: () => Boolean(serverEnv().BAGS_PARTNER_WALLET),
  solana: () => Boolean(serverEnv().HELIUS_RPC_URL),
  payoutKey: () => Boolean(serverEnv().SOLANA_PAYOUT_KEYPAIR),
  cron: () => Boolean(serverEnv().CRON_SECRET),
};

export function databaseUrl(): string | undefined {
  const env = serverEnv();
  const url =
    env.DATABASE_URL ??
    env.DATABASE_POSTGRES_URL ??
    env.DATABASE_POSTGRES_PRISMA_URL ??
    env.POSTGRES_URL ??
    env.POSTGRES_PRISMA_URL;
  return normalizeDatabaseUrl(url);
}

export function databaseUrlUnpooled(): string | undefined {
  const env = serverEnv();
  const url =
    env.DATABASE_URL_UNPOOLED ??
    env.DATABASE_POSTGRES_URL_NON_POOLING ??
    env.DATABASE_POSTGRES_URL ??
    env.DATABASE_POSTGRES_PRISMA_URL ??
    env.POSTGRES_URL_NON_POOLING ??
    env.POSTGRES_URL ??
    env.POSTGRES_PRISMA_URL ??
    env.DATABASE_URL;
  return normalizeDatabaseUrl(url);
}

export function normalizeDatabaseUrl(
  url: string | undefined,
): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith(".neon.tech") &&
      (!parsed.searchParams.has("sslmode") ||
        ["prefer", "require", "verify-ca"].includes(
          parsed.searchParams.get("sslmode") ?? "",
        ))
    ) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

export function databaseProvider(): "supabase" | "neon" | "postgres" | "none" {
  const url = databaseUrl();
  if (!url) return "none";
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("supabase.")) return "supabase";
    if (hostname.endsWith(".neon.tech")) return "neon";
    return "postgres";
  } catch {
    return "postgres";
  }
}

export function redisUrl(): string | undefined {
  const env = serverEnv();
  return env.REDIS_URL ?? env.UPSTASH_REDIS_REST_REDIS_URL;
}

export function stubsAllowed(): boolean {
  const env = serverEnv();
  return env.NODE_ENV !== "production" || env.ALLOW_STUBS_IN_PROD;
}

/**
 * Safety check: should we allow a real Bags launch transaction?
 * Refuses when the cluster is devnet AND the key looks production-y,
 * unless BAGS_ALLOW_PROD_LAUNCH=true is explicitly set.
 */
export function canLaunchOnBags():
  | { ok: true }
  | { ok: false; reason: string } {
  const env = serverEnv();
  if (!env.BAGS_API_KEY) return { ok: false, reason: "BAGS_API_KEY missing" };
  if (!env.HELIUS_RPC_URL)
    return { ok: false, reason: "HELIUS_RPC_URL missing" };
  if (!env.SOLANA_PAYOUT_KEYPAIR) {
    return { ok: false, reason: "SOLANA_PAYOUT_KEYPAIR missing" };
  }
  const cluster = clientEnv().NEXT_PUBLIC_SOLANA_CLUSTER;
  const isProdKey = env.BAGS_API_KEY.startsWith("bags_prod_");
  if (cluster !== "mainnet-beta" && isProdKey && !env.BAGS_ALLOW_PROD_LAUNCH) {
    return {
      ok: false,
      reason:
        "Refusing prod-key launch on non-mainnet cluster. Set BAGS_ALLOW_PROD_LAUNCH=true to override.",
    };
  }
  return { ok: true };
}

export interface ProductionReadiness {
  ok: boolean;
  mode: "production" | "non-production";
  missing: string[];
  warnings: string[];
  cluster: ClientEnv["NEXT_PUBLIC_SOLANA_CLUSTER"];
  bagsApiBaseUrl: string;
  partnerWalletConfigured: boolean;
  partnerConfigConfigured: boolean;
  refCode: string;
}

export function productionReadiness(): ProductionReadiness {
  const env = serverEnv();
  const publicEnv = clientEnv();
  const missing: string[] = [];
  const warnings: string[] = [];

  if (env.NODE_ENV !== "production") {
    return {
      ok: true,
      mode: "non-production",
      missing,
      warnings,
      cluster: publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER,
      bagsApiBaseUrl: env.BAGS_API_BASE_URL,
      partnerWalletConfigured: Boolean(env.BAGS_PARTNER_WALLET),
      partnerConfigConfigured: Boolean(env.BAGS_PARTNER_CONFIG_KEY),
      refCode: env.BAGS_REF_CODE,
    };
  }

  const requiredServer: Array<[string, unknown]> = [
    ["DATABASE_URL or POSTGRES_URL", databaseUrl()],
    ["REDIS_URL or UPSTASH_REDIS_REST_REDIS_URL", redisUrl()],
    ["BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET],
    ["BETTER_AUTH_URL", env.BETTER_AUTH_URL],
    ["GITHUB_CLIENT_ID", env.GITHUB_CLIENT_ID],
    ["GITHUB_CLIENT_SECRET", env.GITHUB_CLIENT_SECRET],
    ["GITHUB_APP_ID", env.GITHUB_APP_ID],
    ["GITHUB_APP_PRIVATE_KEY", env.GITHUB_APP_PRIVATE_KEY],
    ["GITHUB_APP_WEBHOOK_SECRET", env.GITHUB_APP_WEBHOOK_SECRET],
    ["GITHUB_APP_SLUG", env.GITHUB_APP_SLUG],
    ["BAGS_API_KEY", env.BAGS_API_KEY],
    ["BAGS_WEBHOOK_SECRET", env.BAGS_WEBHOOK_SECRET],
    ["BAGS_PARTNER_WALLET", env.BAGS_PARTNER_WALLET],
    ["HELIUS_RPC_URL", env.HELIUS_RPC_URL],
    ["SOLANA_PAYOUT_KEYPAIR", env.SOLANA_PAYOUT_KEYPAIR],
    ["CRON_SECRET", env.CRON_SECRET],
    ["IDEMPOTENCY_KEY_SECRET", env.IDEMPOTENCY_KEY_SECRET],
  ];

  for (const [name, value] of requiredServer) {
    if (!value) missing.push(name);
  }

  const publicDatabaseVars = Object.keys(process.env).filter(
    (name) =>
      name === "NEXT_PUBLIC_DATABASE_URL" ||
      name.startsWith("NEXT_PUBLIC_DATABASE_URL_"),
  );
  if (publicDatabaseVars.length > 0) {
    missing.push("Remove NEXT_PUBLIC_DATABASE_URL*");
    warnings.push(
      "NEXT_PUBLIC_DATABASE_URL* is an unsafe/misleading public env prefix. Use POSTGRES_URL or DATABASE_URL server-side only, and NEXT_PUBLIC_SUPABASE_* only for Supabase browser client values.",
    );
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    missing.push("NEXT_PUBLIC_APP_URL");
  } else if (publicEnv.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    warnings.push("NEXT_PUBLIC_APP_URL points at localhost.");
  }

  if (env.BETTER_AUTH_URL?.includes("localhost")) {
    warnings.push("BETTER_AUTH_URL points at localhost.");
  } else if (
    env.BETTER_AUTH_URL &&
    process.env.NEXT_PUBLIC_APP_URL &&
    env.BETTER_AUTH_URL !== publicEnv.NEXT_PUBLIC_APP_URL
  ) {
    warnings.push("BETTER_AUTH_URL does not match NEXT_PUBLIC_APP_URL.");
  }

  if (publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta") {
    missing.push("NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta");
  }

  if (
    publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" &&
    env.HELIUS_RPC_URL &&
    /devnet|testnet/i.test(env.HELIUS_RPC_URL)
  ) {
    warnings.push("HELIUS_RPC_URL appears to target devnet/testnet.");
  }

  if (env.ALLOW_STUBS_IN_PROD) {
    warnings.push("ALLOW_STUBS_IN_PROD=true leaves production in stub mode.");
  }

  if (env.ALLOW_DEMO_SEED) {
    missing.push("ALLOW_DEMO_SEED=true must be removed in production");
  }

  const provider = databaseProvider();
  if (provider !== "neon" && provider !== "none") {
    if (env.ALLOW_NON_NEON_RLS_OFF) {
      warnings.push(
        "ALLOW_NON_NEON_RLS_OFF=true: RLS is disabled, app-layer requirePermission is the only authorization boundary.",
      );
    } else {
      missing.push(
        `DATABASE_URL must be a Neon URL for RLS (got provider=${provider}); set ALLOW_NON_NEON_RLS_OFF=true to override`,
      );
    }
  }

  if (env.BAGS_API_KEY && !env.BAGS_API_KEY.startsWith("bags_prod_")) {
    warnings.push("BAGS_API_KEY does not look like a production key.");
  }

  if (env.BAGS_PARTNER_WALLET && !env.BAGS_PARTNER_CONFIG_KEY) {
    missing.push("BAGS_PARTNER_CONFIG_KEY");
  }

  if (env.PLATFORM_FEE_BPS_DEFAULT > 0 && !env.SOLANA_TREASURY_ADDRESS) {
    missing.push("SOLANA_TREASURY_ADDRESS");
  }

  if (!env.BAGS_API_BASE_URL.startsWith("https://public-api-v2.bags.fm/")) {
    warnings.push("BAGS_API_BASE_URL is not the canonical public API host.");
  }

  return {
    ok: missing.length === 0 && warnings.length === 0,
    mode: "production",
    missing,
    warnings,
    cluster: publicEnv.NEXT_PUBLIC_SOLANA_CLUSTER,
    bagsApiBaseUrl: env.BAGS_API_BASE_URL,
    partnerWalletConfigured: Boolean(env.BAGS_PARTNER_WALLET),
    partnerConfigConfigured: Boolean(env.BAGS_PARTNER_CONFIG_KEY),
    refCode: env.BAGS_REF_CODE,
  };
}
