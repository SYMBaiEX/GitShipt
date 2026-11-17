import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../../scripts/check-production-env.mjs", import.meta.url));
const fixture: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: "https://gitshipt.com",
  NEXT_PUBLIC_SOLANA_CLUSTER: "mainnet-beta",
  DATABASE_URL: "postgresql://test:test@db.test.neon.tech/neondb",
  DATABASE_URL_UNPOOLED: "postgresql://test:test@db.test.neon.tech/neondb",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_URL: "https://gitshipt.com",
  BAGS_API_KEY: "bags_prod_test",
  BAGS_ALLOW_PROD_LAUNCH: "true",
  BAGS_PARTNER_WALLET: "1".repeat(32),
  BAGS_PARTNER_CONFIG_KEY: "2".repeat(32),
  HELIUS_RPC_URL: "https://rpc.helius.test",
  SOLANA_TREASURY_ADDRESS: "3".repeat(32),
  SECRETS_SENSITIVE_ATTESTED: "true",
};
for (const name of ["BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET", "GITHUB_APP_SLUG", "BAGS_WEBHOOK_SECRET", "HELIUS_WEBHOOK_AUTH_TOKEN", "SOLANA_PAYOUT_KEYPAIR", "CRON_SECRET", "IDEMPOTENCY_KEY_SECRET"]) {
  fixture[name] = "test-configured-value";
}
function check(overrides: Record<string, string>) {
  const result = spawnSync(process.execPath, [script, "--env-file=/dev/null"], {
    env: { NODE_ENV: "production", ...fixture, ...overrides }, encoding: "utf8",
  });
  return { code: result.status, output: result.stdout + result.stderr };
}
describe("owner launch environment checker", () => {
  it("does not require a manager or a zero legacy fee setting", () => {
    const result = check({ PLATFORM_FEE_BPS_DEFAULT: "1000" });
    expect(result.code, result.output).toBe(0);
    expect(result.output).not.toContain("SOLANA_MANAGER_KEYPAIR");
  });
  it("requires the platform recipient and reviewed Secret protection", () => {
    expect(check({ SOLANA_TREASURY_ADDRESS: "" }).output).toContain("SOLANA_TREASURY_ADDRESS");
    const result = check({ SECRETS_SENSITIVE_ATTESTED: "" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("SECRETS_SENSITIVE_ATTESTED");
  });
});
