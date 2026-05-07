import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function installEnvMocks(managerKeypair?: string) {
  const env = {
    NODE_ENV: "test",
    SOLANA_MANAGER_KEYPAIR: managerKeypair,
  };
  vi.doMock("@/lib/env", () => ({
    serverEnv: () => env,
    hasCredentials: {
      managerKey: () => Boolean(env.SOLANA_MANAGER_KEYPAIR),
    },
  }));
}

describe("manager-signer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when SOLANA_MANAGER_KEYPAIR is not configured", async () => {
    installEnvMocks(undefined);
    const { managerSigner } = await import("./manager-signer");
    expect(() => managerSigner()).toThrow(
      /SOLANA_MANAGER_KEYPAIR is not configured/,
    );
  });

  it("decodes a base58 secret key into a Keypair", async () => {
    const kp = Keypair.generate();
    const secret = bs58.encode(kp.secretKey);
    installEnvMocks(secret);
    const { managerSigner } = await import("./manager-signer");
    const result = managerSigner();
    expect(result.publicKey.equals(kp.publicKey)).toBe(true);
  });

  it("memoizes — returns the same Keypair instance on repeat calls", async () => {
    const kp = Keypair.generate();
    installEnvMocks(bs58.encode(kp.secretKey));
    const { managerSigner } = await import("./manager-signer");
    const a = managerSigner();
    const b = managerSigner();
    expect(a).toBe(b);
  });

  it("managerSignerPublicKey returns null when keypair missing", async () => {
    installEnvMocks(undefined);
    const { managerSignerPublicKey } = await import("./manager-signer");
    expect(managerSignerPublicKey()).toBeNull();
  });

  it("managerSignerPublicKey returns base58 pubkey when configured", async () => {
    const kp = Keypair.generate();
    installEnvMocks(bs58.encode(kp.secretKey));
    const { managerSignerPublicKey } = await import("./manager-signer");
    expect(managerSignerPublicKey()).toBe(kp.publicKey.toBase58());
  });
});
