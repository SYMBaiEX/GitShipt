import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());

describe("boolean environment flags", () => {
  const flags = [
    "BAGS_ALLOW_PROD_LAUNCH",
    "ALLOW_STUBS_IN_PROD",
    "KILL_SWITCH_ENABLED",
    "EMERGENCY_KILL_SWITCH",
    "ALLOW_DEMO_SEED",
    "ALLOW_NON_NEON_RLS_OFF",
    "SECRETS_SENSITIVE_ATTESTED",
  ] as const;
  it.each(flags)("parses %s=false as false", async (flag) => {
    vi.stubEnv(flag, "false");
    const { serverEnv } = await import("./env");
    expect(serverEnv()[flag]).toBe(false);
  });
  it.each(flags)("parses %s=true as true", async (flag) => {
    vi.stubEnv(flag, "true");
    const { serverEnv } = await import("./env");
    expect(serverEnv()[flag]).toBe(true);
  });
  it("refuses ambiguous safety flag values", async () => {
    vi.stubEnv("ALLOW_STUBS_IN_PROD", "yes");
    const { serverEnv } = await import("./env");
    expect(() => serverEnv()).toThrow("Invalid server environment");
  });
});

describe("mainnet launch gate", () => {
  beforeEach(() => {
    vi.stubEnv("BAGS_API_KEY", "bags_prod_test");
    vi.stubEnv("HELIUS_RPC_URL", "https://mainnet.helius-rpc.com");
    vi.stubEnv("SOLANA_PAYOUT_KEYPAIR", "configured");
    vi.stubEnv("SOLANA_MANAGER_KEYPAIR", "configured");
    vi.stubEnv("BAGS_PARTNER_CONFIG_KEY", "1".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_SOLANA_CLUSTER", "mainnet-beta");
    vi.stubEnv("EMERGENCY_KILL_SWITCH", "false");
    vi.stubEnv("KILL_SWITCH_ENABLED", "false");
    vi.stubEnv("BAGS_ALLOW_PROD_LAUNCH", "true");
  });
  it("allows explicitly enabled mainnet creation with the required services", async () => {
    const { canLaunchOnBags } = await import("./env");
    expect(canLaunchOnBags()).toEqual({ ok: true });
  });
  it("blocks mainnet creation when disabled", async () => {
    vi.stubEnv("BAGS_ALLOW_PROD_LAUNCH", "false");
    const { canLaunchOnBags } = await import("./env");
    expect(canLaunchOnBags()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("BAGS_ALLOW_PROD_LAUNCH=true"),
    });
  });
  it("blocks creation without the platform partner config", async () => {
    vi.stubEnv("BAGS_PARTNER_CONFIG_KEY", "");
    const { canLaunchOnBags } = await import("./env");
    expect(canLaunchOnBags()).toEqual({
      ok: false,
      reason: "BAGS_PARTNER_CONFIG_KEY missing",
    });
  });
  it("requires a manager only for contributor-mode launches", async () => {
    vi.stubEnv("SOLANA_MANAGER_KEYPAIR", "");
    const { canLaunchOnBags } = await import("./env");
    expect(canLaunchOnBags("owner")).toEqual({ ok: true });
    expect(canLaunchOnBags("contributors")).toEqual({ ok: false, reason: "SOLANA_MANAGER_KEYPAIR missing" });
  });
  it("respects the emergency stop", async () => {
    vi.stubEnv("EMERGENCY_KILL_SWITCH", "true");
    const { canLaunchOnBags } = await import("./env");
    expect(canLaunchOnBags()).toMatchObject({ ok: false });
  });
});
