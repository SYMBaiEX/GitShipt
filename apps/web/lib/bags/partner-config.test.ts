import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import idl from "@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_BAGS_PARTNER_WALLET } from "@/lib/env";
import {
  assertPlatformOnlyPartner,
  decodePartnerConfig,
} from "./partner-config";

const owner = new PublicKey(idl.address);
const wallet = Keypair.generate().publicKey;
const [address] = PublicKey.findProgramAddressSync(
  [Buffer.from("partner_config"), wallet.toBuffer()],
  owner,
);
function fixture() {
  const data = Buffer.alloc(128);
  Buffer.from(
    new BorshAccountsCoder(idl as Idl).accountDiscriminator("PartnerConfig"),
  ).copy(data);
  wallet.toBuffer().copy(data, 48);
  data.writeUInt8(2, 80);
  data.writeUInt16LE(2500, 81);
  data.writeUInt8(252, 85);
  data.writeBigUInt64LE(123n, 8);
  return { owner, data };
}
describe("partner fee collection", () => {
  it("does not confuse the verified partner config address with its wallet", () => {
    const [config] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("partner_config"),
        new PublicKey(DEFAULT_BAGS_PARTNER_WALLET).toBuffer(),
      ],
      owner,
    );
    expect(config.toBase58()).toBe(
      "HXs58Qa6YtgJfWVkQVnpFmw6WoEdFEL4LLD1ArZjMvTH",
    );
  });
  it("reads platform-side BPS independently of the zero creator-side rate", () => {
    const config = decodePartnerConfig(address, fixture());
    expect(config).toMatchObject({
      partner: wallet.toBase58(),
      bps: 0,
      feeCollectionMode: 2,
      feeCollectionPlatformBps: 2500,
      totalClaimedFees: 123n,
    });
    expect(() =>
      assertPlatformOnlyPartner(config, wallet.toBase58()),
    ).not.toThrow();
  });
  it("rejects creator-pool deductions, wrong wallets, and inactive modes", () => {
    const config = decodePartnerConfig(address, fixture());
    for (const invalid of [
      { ...config, bps: 2500 },
      { ...config, feeCollectionMode: 0 },
      { ...config, feeCollectionPlatformBps: 0 },
    ]) {
      expect(() =>
        assertPlatformOnlyPartner(invalid, wallet.toBase58()),
      ).toThrow();
    }
    expect(() => assertPlatformOnlyPartner(config, owner.toBase58())).toThrow();
  });
  it("rejects malformed accounts and mismatched PDAs", () => {
    expect(() =>
      decodePartnerConfig(address, { ...fixture(), owner: wallet }),
    ).toThrow();
    expect(() =>
      decodePartnerConfig(address, { owner, data: Buffer.alloc(10) }),
    ).toThrow();
    expect(() =>
      decodePartnerConfig(address, { owner, data: Buffer.alloc(128) }),
    ).toThrow();
    expect(() => decodePartnerConfig(wallet, fixture())).toThrow(/PDA/);
    const invalid = fixture();
    invalid.data.writeUInt8(255, 80);
    expect(() => decodePartnerConfig(address, invalid)).toThrow();
  });
});
