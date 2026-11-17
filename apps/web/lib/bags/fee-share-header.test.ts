import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BAGS_FEE_SHARE_V2_PROGRAM_ID } from "./program-client";
import { verifyFeeShareHeader } from "./fee-share-header";

function fixture() {
  const baseMint = Keypair.generate().publicKey;
  const quoteMint = Keypair.generate().publicKey;
  const partner = Keypair.generate().publicKey;
  const partnerConfig = Keypair.generate().publicKey;
  const manager = Keypair.generate().publicKey;
  const data = Buffer.alloc(184);
  Buffer.from([40, 71, 136, 156, 222, 49, 31, 201]).copy(data);
  for (const [key, offset] of [
    [baseMint, 8],
    [quoteMint, 40],
    [partner, 72],
    [partnerConfig, 104],
    [manager, 136],
  ] as const)
    key.toBuffer().copy(data, offset);
  data[176] = 1;
  return {
    owner: BAGS_FEE_SHARE_V2_PROGRAM_ID,
    data,
    baseMint,
    quoteMint,
    partner,
    partnerConfig,
    manager,
  };
}

describe("fee share header", () => {
  it("checks documented fixed fields and returns manager", () => {
    const f = fixture();
    expect(verifyFeeShareHeader(f).manager.equals(f.manager)).toBe(true);
  });
  it("rejects wrong owner, discriminator and truncated accounts", () => {
    const f = fixture();
    expect(() =>
      verifyFeeShareHeader({ ...f, owner: PublicKey.default }),
    ).toThrow(/owner/);
    expect(() =>
      verifyFeeShareHeader({ ...f, data: Buffer.alloc(184) }),
    ).toThrow(/header/);
    expect(() =>
      verifyFeeShareHeader({ ...f, data: f.data.subarray(0, 183) }),
    ).toThrow(/header/);
  });
  it("rejects wrong mint, partner and initialization or lock flags", () => {
    const f = fixture();
    expect(() =>
      verifyFeeShareHeader({ ...f, baseMint: PublicKey.default }),
    ).toThrow(/base mint/);
    expect(() =>
      verifyFeeShareHeader({ ...f, partnerConfig: PublicKey.default }),
    ).toThrow(/partner config/);
    const unfinalized = Buffer.from(f.data);
    unfinalized[176] = 0;
    expect(() => verifyFeeShareHeader({ ...f, data: unfinalized })).toThrow(
      /not finalized/,
    );
    const locked = Buffer.from(f.data);
    locked[177] = 1;
    expect(() => verifyFeeShareHeader({ ...f, data: locked })).toThrow(
      /locked/,
    );
  });
});
