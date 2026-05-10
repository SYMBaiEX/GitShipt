#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_FILE = ".env.local";

const REQUIRED = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    scope: "Public app",
    sensitive: false,
    note: "Canonical deployed HTTPS origin.",
  },
  {
    name: "NEXT_PUBLIC_SOLANA_CLUSTER",
    scope: "Public app",
    sensitive: false,
    expected: "mainnet-beta",
    note: "Must be mainnet-beta for production/live Bags launches.",
  },
  {
    name: "DATABASE_URL or POSTGRES_URL",
    names: [
      "DATABASE_URL",
      "DATABASE_POSTGRES_URL",
      "DATABASE_POSTGRES_PRISMA_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
    ],
    scope: "Database",
    sensitive: true,
    note: "Server-only Neon/Postgres pooled runtime URL.",
  },
  {
    name: "REDIS_URL or UPSTASH_REDIS_REST_REDIS_URL",
    names: ["REDIS_URL", "UPSTASH_REDIS_REST_REDIS_URL"],
    scope: "Redis",
    sensitive: true,
    note: "Required for rate limits, idempotency, SIWS nonces, and workflows.",
  },
  {
    name: "BETTER_AUTH_SECRET",
    scope: "Auth",
    sensitive: true,
    note: "32+ random bytes.",
  },
  {
    name: "BETTER_AUTH_URL",
    scope: "Auth",
    sensitive: false,
    note: "Must match NEXT_PUBLIC_APP_URL.",
  },
  {
    name: "GITHUB_CLIENT_ID",
    scope: "GitHub OAuth",
    sensitive: false,
    note: "OAuth app client id.",
  },
  {
    name: "GITHUB_CLIENT_SECRET",
    scope: "GitHub OAuth",
    sensitive: true,
    note: "OAuth app secret.",
  },
  {
    name: "GITHUB_APP_ID",
    scope: "GitHub App",
    sensitive: false,
    note: "GitHub App id.",
  },
  {
    name: "GITHUB_APP_PRIVATE_KEY",
    scope: "GitHub App",
    sensitive: true,
    note: "PEM private key, newline escaped if the host requires it.",
  },
  {
    name: "GITHUB_APP_WEBHOOK_SECRET",
    scope: "GitHub App",
    sensitive: true,
    note: "Webhook secret configured in GitHub App settings.",
  },
  {
    name: "GITHUB_APP_SLUG",
    scope: "GitHub App",
    sensitive: false,
    note: "Short GitHub App URL slug, not the full URL.",
  },
  {
    name: "BAGS_API_KEY",
    scope: "Bags",
    sensitive: true,
    note: "Production Bags API key.",
  },
  {
    name: "BAGS_WEBHOOK_SECRET",
    scope: "Bags",
    sensitive: true,
    note: "Bags webhook signature secret.",
  },
  {
    name: "BAGS_PARTNER_WALLET",
    scope: "Bags",
    sensitive: false,
    note: "Public partner wallet.",
  },
  {
    name: "BAGS_PARTNER_CONFIG_KEY",
    scope: "Bags",
    sensitive: true,
    note: "Config key for the exact partner wallet above.",
  },
  {
    name: "HELIUS_RPC_URL",
    scope: "Solana",
    sensitive: true,
    note: "Mainnet Helius RPC URL.",
  },
  {
    name: "HELIUS_WEBHOOK_AUTH_TOKEN",
    scope: "Solana",
    sensitive: true,
    note: "Bearer token Helius sends to /api/webhooks/helius/bags-events.",
  },
  {
    name: "SOLANA_PAYOUT_KEYPAIR",
    scope: "Solana",
    sensitive: true,
    note: "Base58 hot payout keypair. Never use the cold treasury key. (legacy v1.0; deleted in Phase 6)",
  },
  {
    name: "SOLANA_MANAGER_KEYPAIR",
    scope: "Solana",
    sensitive: true,
    note: "Base58 keypair holding the on-chain fee-share-config admin role per project. manager — BPS-rebalance authority only.",
  },
  {
    name: "SOLANA_TREASURY_ADDRESS",
    scope: "Solana",
    sensitive: false,
    note: "Cold treasury public address for platform fee share.",
  },
  {
    name: "CRON_SECRET",
    scope: "Cron",
    sensitive: true,
    note: "Bearer token for cron endpoints.",
  },
  {
    name: "IDEMPOTENCY_KEY_SECRET",
    scope: "Idempotency",
    sensitive: true,
    note: "HMAC key for production idempotency replay envelopes.",
  },
];

const RECOMMENDED = [
  {
    name: "DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING",
    names: [
      "DATABASE_URL_UNPOOLED",
      "DATABASE_POSTGRES_URL_NON_POOLING",
      "POSTGRES_URL_NON_POOLING",
    ],
    scope: "Database",
    sensitive: true,
    note: "Useful for migrations and direct administrative DB work.",
  },
  {
    name: "ADMIN_EMAIL_ALLOWLIST",
    scope: "Admin",
    sensitive: false,
    note: "Bootstrap operator allowlist if your deployment workflow uses it.",
  },
];

function parseArgs(argv) {
  const args = { envFile: DEFAULT_ENV_FILE, printTemplate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--print-template") {
      args.printTemplate = true;
    } else if (arg === "--env-file") {
      args.envFile = argv[i + 1] ?? DEFAULT_ENV_FILE;
      i += 1;
    } else if (arg.startsWith("--env-file=")) {
      args.envFile = arg.slice("--env-file=".length);
    }
  }
  return args;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const entries = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function valueOf(env, name) {
  return env[name]?.trim() ?? "";
}

function valueOfAny(env, names) {
  for (const name of names) {
    const value = valueOf(env, name);
    if (!isPlaceholder(value)) return value;
  }
  return "";
}

function isPlaceholder(value) {
  return (
    value === "" ||
    /^(your_|change_me|changeme|todo|replace_me|example)/i.test(value) ||
    /your-|\.example\b/i.test(value) ||
    value.includes("YOUR_KEY") ||
    value.includes("<") ||
    value.includes(">")
  );
}

function isLocalUrl(value) {
  return /localhost|127\.0\.0\.1|\.local\b/i.test(value);
}

function validate(env) {
  const missing = [];
  const warnings = [];
  const missingNames = new Set();

  function addMissing(item) {
    if (missingNames.has(item.name)) return;
    missingNames.add(item.name);
    missing.push(item);
  }

  for (const item of REQUIRED) {
    const value = item.names
      ? valueOfAny(env, item.names)
      : valueOf(env, item.name);
    if (isPlaceholder(value)) {
      addMissing(item);
      continue;
    }
    if (item.expected && value !== item.expected) {
      addMissing({
        ...item,
        note: `Expected ${item.expected}; got ${value}.`,
      });
    }
  }

  const appUrl = valueOf(env, "NEXT_PUBLIC_APP_URL");
  const authUrl = valueOf(env, "BETTER_AUTH_URL");
  if (appUrl && isLocalUrl(appUrl)) {
    warnings.push("NEXT_PUBLIC_APP_URL points at a local origin.");
  }
  if (authUrl && isLocalUrl(authUrl)) {
    warnings.push("BETTER_AUTH_URL points at a local origin.");
  }
  if (appUrl && authUrl && appUrl !== authUrl) {
    warnings.push("BETTER_AUTH_URL should match NEXT_PUBLIC_APP_URL.");
  }

  const publicDatabaseVars = Object.keys(env).filter((name) =>
    /^NEXT_PUBLIC_DATABASE_URL($|_)/.test(name),
  );
  if (publicDatabaseVars.length > 0) {
    addMissing({
      name: "Remove NEXT_PUBLIC_DATABASE_URL*",
      scope: "Database",
      sensitive: true,
      note: "Do not use DATABASE_URL as a public env prefix. Keep Postgres URLs server-only.",
    });
  }

  const helius = valueOf(env, "HELIUS_RPC_URL");
  if (
    valueOf(env, "NEXT_PUBLIC_SOLANA_CLUSTER") === "mainnet-beta" &&
    /devnet|testnet/i.test(helius)
  ) {
    warnings.push("HELIUS_RPC_URL appears to target devnet/testnet.");
  }

  const bagsKey = valueOf(env, "BAGS_API_KEY");
  if (bagsKey && !bagsKey.startsWith("bags_prod_")) {
    warnings.push("BAGS_API_KEY does not look like a production key.");
  }

  const platformBps = Number(valueOf(env, "PLATFORM_FEE_BPS_DEFAULT") || "500");
  if (
    platformBps > 0 &&
    isPlaceholder(valueOf(env, "SOLANA_TREASURY_ADDRESS"))
  ) {
    addMissing({
      name: "SOLANA_TREASURY_ADDRESS",
      scope: "Solana",
      sensitive: false,
      note: "Required because PLATFORM_FEE_BPS_DEFAULT is greater than 0.",
    });
  }

  for (const item of RECOMMENDED) {
    const value = item.names
      ? valueOfAny(env, item.names)
      : valueOf(env, item.name);
    if (isPlaceholder(value)) {
      warnings.push(`${item.name} is not set. ${item.note}`);
    }
  }

  return { missing, warnings };
}

function printTemplate() {
  console.log("GitShipt production variables");
  console.log("============================");
  for (const item of [...REQUIRED, ...RECOMMENDED]) {
    const visibility = item.sensitive ? "Sensitive" : "Plain";
    console.log(`${item.name}\t${visibility}\t${item.scope}\t${item.note}`);
  }
}

function printReport({ envFile, exists, missing, warnings }) {
  console.log("GitShipt production env check");
  console.log("============================");
  console.log(
    `Env file: ${envFile}${exists ? "" : " (not found, using process env only)"}`,
  );
  console.log("");

  if (missing.length === 0 && warnings.length === 0) {
    console.log("Ready: all required production variables are present.");
    return;
  }

  if (missing.length > 0) {
    console.log("Missing or invalid required variables:");
    for (const item of missing) {
      const visibility = item.sensitive ? "Sensitive" : "Plain";
      console.log(
        `- ${item.name} [${visibility}] (${item.scope}): ${item.note}`,
      );
    }
    console.log("");
  }

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  console.log(
    "Tip: run `bun run env:template` for the full variable input list.",
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.printTemplate) {
  printTemplate();
  process.exit(0);
}

const envFilePath = path.resolve(process.cwd(), args.envFile);
const fileEnv = parseEnvFile(envFilePath);
const env = { ...process.env, ...fileEnv };
const result = validate(env);
printReport({
  envFile: args.envFile,
  exists: fs.existsSync(envFilePath),
  ...result,
});

process.exit(
  result.missing.length === 0 && result.warnings.length === 0 ? 0 : 1,
);
