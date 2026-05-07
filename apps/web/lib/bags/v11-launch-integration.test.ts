import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MirrorClaimerInput, MirrorLaunchInput } from "./v11-launch-integration";

const VALID_MINT = "So11111111111111111111111111111111111111112";
const VALID_ADMIN = "11111111111111111111111111111111";

function claimer(
  i: number,
  bps: number,
  override: Partial<MirrorClaimerInput> = {},
): MirrorClaimerInput {
  return {
    slotIndex: i,
    claimerPubkey: `pubkey_${i}_${"x".repeat(28).slice(0, 30 - String(i).length)}`,
    provider: "github",
    socialHandle: `user${i}`,
    contributorId: null,
    initialBps: bps,
    ...override,
  };
}

function baseInput(
  claimers: MirrorClaimerInput[],
  override: Partial<MirrorLaunchInput> = {},
): MirrorLaunchInput {
  return {
    projectId: "proj_test",
    baseMint: VALID_MINT,
    adminPubkey: VALID_ADMIN,
    claimers,
    steadyStateCadenceHours: 72,
    ...override,
  };
}

describe("mirrorLaunchToV11Tables — input validation", () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock the DB so the validation runs but the insert paths short-circuit
    // (we're testing pure validation, not the I/O path).
    vi.doMock("@/db", () => ({
      dbHttp: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: async () => [{ id: "stub" }],
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
      },
    }));
    vi.doMock("@/lib/audit", () => ({ audit: vi.fn() }));
    vi.doMock("@/lib/env", () => ({
      serverEnv: () => ({}),
      hasCredentials: { managerKey: () => false },
    }));
    vi.doMock("@/lib/solana/manager-signer", () => ({
      managerSigner: () => {
        throw new Error("not used in validation tests");
      },
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects empty claimers array", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    await expect(
      mirrorLaunchToV11Tables(baseInput([])),
    ).rejects.toThrow(/claimers.length must be 1..100/);
  });

  it("rejects more than 100 claimers", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    const tooMany = Array.from({ length: 101 }, (_, i) => claimer(i, 99));
    await expect(
      mirrorLaunchToV11Tables(baseInput(tooMany)),
    ).rejects.toThrow(/claimers.length must be 1..100/);
  });

  it("rejects bps sum != 10000", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    await expect(
      mirrorLaunchToV11Tables(
        baseInput([claimer(0, 5000), claimer(1, 4000)]),
      ),
    ).rejects.toThrow(/sum of initialBps must be 10000/);
  });

  it("rejects bps value out of range", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    await expect(
      mirrorLaunchToV11Tables(
        baseInput([claimer(0, 10001)]),
      ),
    ).rejects.toThrow(/initialBps must be in/);
  });

  it("rejects duplicate slot indices", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    await expect(
      mirrorLaunchToV11Tables(
        baseInput([claimer(0, 5000), claimer(0, 5000)]),
      ),
    ).rejects.toThrow(/duplicate slotIndex/);
  });

  it("rejects sparse slot indices (must be dense [0..N-1])", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    await expect(
      mirrorLaunchToV11Tables(
        baseInput([claimer(0, 5000), claimer(2, 5000)]),
      ),
    ).rejects.toThrow(/dense/);
  });

  it("rejects duplicate claimer pubkeys even with distinct slots", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    const a = claimer(0, 5000);
    const b = claimer(1, 5000, { claimerPubkey: a.claimerPubkey });
    await expect(
      mirrorLaunchToV11Tables(baseInput([a, b])),
    ).rejects.toThrow(/duplicate claimer pubkey/);
  });

  it("accepts a valid minimal input (1 claimer at 10000 bps)", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    // The DB is stubbed to return [] for the existing-config check + a stub
    // id from inserts, so this should resolve without throwing.
    const result = await mirrorLaunchToV11Tables(
      baseInput([claimer(0, 10000)]),
    );
    expect(result.alreadyMirrored).toBe(false);
    expect(typeof result.feeShareConfigPda).toBe("string");
  });

  it("accepts a 50-claimer split that sums to 10000 (default cap)", async () => {
    const { mirrorLaunchToV11Tables } = await import(
      "./v11-launch-integration"
    );
    const claimers = Array.from({ length: 50 }, (_, i) => claimer(i, 200));
    const result = await mirrorLaunchToV11Tables(baseInput(claimers));
    expect(result.alreadyMirrored).toBe(false);
  });
});
