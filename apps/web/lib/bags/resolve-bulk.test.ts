import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EnvOverrides = Partial<{
  BAGS_API_KEY: string | undefined;
  BAGS_API_BASE_URL: string;
  HELIUS_RPC_URL: string;
}>;

function installEnvMocks(overrides: EnvOverrides = {}) {
  const env = {
    NODE_ENV: "test",
    BAGS_API_BASE_URL: "https://public-api-v2.bags.fm/api/v1/",
    BAGS_API_KEY: "test-key" as string | undefined,
    HELIUS_RPC_URL: "https://stub.example.com" as string | undefined,
    ...overrides,
  };
  vi.doMock("@/lib/env", () => ({
    serverEnv: () => env,
    hasCredentials: {
      bags: () => Boolean(env.BAGS_API_KEY),
    },
    canLaunchOnBags: () =>
      env.BAGS_API_KEY
        ? { ok: true }
        : { ok: false, reason: "BAGS_API_KEY missing" },
    stubsAllowed: () => true,
  }));
  vi.doMock("@/lib/solana/signer", () => ({
    payoutSigner: () => {
      throw new Error("payoutSigner should not be called in this test");
    },
  }));
}

function installSdkMock(getLaunchWalletV2Bulk: ReturnType<typeof vi.fn>) {
  vi.doMock("@bagsfm/bags-sdk", () => ({
    BagsSDK: vi.fn(
      class {
        state = { getLaunchWalletV2Bulk };
      },
    ),
  }));
}

describe("bags.resolveLaunchWalletsBulk", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty array for empty input without calling Bags", async () => {
    installEnvMocks({ BAGS_API_KEY: "test-key" });
    const sdkBulk = vi.fn();
    installSdkMock(sdkBulk);

    const { bags } = await import("./client");
    const result = await bags.resolveLaunchWalletsBulk([]);

    expect(result).toEqual([]);
    expect(sdkBulk).not.toHaveBeenCalled();
  });

  it("returns deterministic stubs (one per input) when BAGS_API_KEY is missing", async () => {
    installEnvMocks({ BAGS_API_KEY: undefined });
    const sdkBulk = vi.fn();
    installSdkMock(sdkBulk);

    const { bags } = await import("./client");
    const result = await bags.resolveLaunchWalletsBulk([
      { provider: "github", username: "octocat" },
      { provider: "github", username: "ada" },
    ]);

    expect(sdkBulk).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      provider: "github",
      username: "octocat",
      __stub: true,
    });
    expect(result[0]?.wallet).toBeTruthy();
    expect(result[1]?.username).toBe("ada");
  });

  it("calls SDK bulk endpoint and normalizes wallet pubkeys to strings", async () => {
    installEnvMocks({ BAGS_API_KEY: "test-key" });
    const sdkBulk = vi.fn().mockResolvedValue([
      {
        provider: "github",
        username: "octocat",
        wallet: {
          toBase58: () => "11111111111111111111111111111111",
        },
        platformData: {
          id: "gh-1",
          username: "octocat",
          display_name: "Octo Cat",
          avatar_url: null,
        },
      },
    ]);
    installSdkMock(sdkBulk);

    const { bags } = await import("./client");
    const result = await bags.resolveLaunchWalletsBulk([
      { provider: "github", username: "octocat" },
    ]);

    expect(sdkBulk).toHaveBeenCalledOnce();
    expect(sdkBulk).toHaveBeenCalledWith([
      { provider: "github", username: "octocat" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.wallet).toBe("11111111111111111111111111111111");
    expect(result[0]?.platformData?.display_name).toBe("Octo Cat");
  });

  it("preserves null wallet/platformData for unresolved handles", async () => {
    installEnvMocks({ BAGS_API_KEY: "test-key" });
    const sdkBulk = vi.fn().mockResolvedValue([
      {
        provider: "github",
        username: "real-dev",
        wallet: {
          toBase58: () => "11111111111111111111111111111111",
        },
        platformData: {
          id: "gh-real",
          username: "real-dev",
          display_name: null,
          avatar_url: null,
        },
      },
      {
        provider: "github",
        username: "ghost-handle",
        wallet: null,
        platformData: null,
      },
    ]);
    installSdkMock(sdkBulk);

    const { bags } = await import("./client");
    const result = await bags.resolveLaunchWalletsBulk([
      { provider: "github", username: "real-dev" },
      { provider: "github", username: "ghost-handle" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.wallet).toBe("11111111111111111111111111111111");
    expect(result[1]?.wallet).toBeNull();
    expect(result[1]?.platformData).toBeNull();
  });
});
