import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { buildOwnerLaunchClaimers, validateOwnerLaunchClaimers } from "./owner-claimers";

describe("owner reward claimers", () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const treasury = Keypair.generate().publicKey.toBase58();
  it("reserves the configured platform share and keeps dense slots", () => {
    const claimers = buildOwnerLaunchClaimers(owner, treasury, 1000);
    expect(claimers.map((c) => [c.slotIndex, c.initialBps])).toEqual([[0, 9000], [1, 1000]]);
    expect(() => validateOwnerLaunchClaimers(claimers, owner, 1000)).not.toThrow();
    expect(buildOwnerLaunchClaimers(owner, undefined, 0)).toHaveLength(1);
  });
  it("fails closed on invalid allocations and altered snapshots", () => {
    expect(() => buildOwnerLaunchClaimers(owner, owner, 1000)).toThrow();
    expect(() => buildOwnerLaunchClaimers(owner, undefined, 1000)).toThrow();
    for (const bps of [-1, 1.5, 10000]) expect(() => buildOwnerLaunchClaimers(owner, treasury, bps)).toThrow();
    const claimers = buildOwnerLaunchClaimers(owner, treasury, 1000);
    expect(() => validateOwnerLaunchClaimers(claimers, treasury, 1000)).toThrow();
    expect(() => validateOwnerLaunchClaimers(claimers, owner, 2000)).toThrow();
    expect(() => validateOwnerLaunchClaimers([{ ...claimers[0]!, slotIndex: 1 }, claimers[1]!], owner, 1000)).toThrow();
  });
});
