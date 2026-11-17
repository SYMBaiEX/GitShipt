import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import idl from "@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json";
import { PartnerConfigSchema, type PartnerConfig } from "./types";

const programId = new PublicKey(idl.address);
const discriminator = new BorshAccountsCoder(idl as Idl).accountDiscriminator(
  "PartnerConfig",
);

function readU128(bytes: Buffer, offset: number): bigint {
  return (
    bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n)
  );
}

/** SDK 1.4.4 omits collection mode/platform BPS; offsets follow its packed decoder and IDL. */
export function decodePartnerConfig(
  address: PublicKey,
  account: Pick<AccountInfo<Buffer>, "owner" | "data">,
): PartnerConfig {
  const bytes = account.data;
  if (
    !account.owner.equals(programId) ||
    bytes.length < 128 ||
    !bytes.subarray(0, 8).equals(discriminator)
  ) {
    throw new Error(
      "Invalid Bags partner account owner, discriminator, or length.",
    );
  }
  const partner = new PublicKey(bytes.subarray(48, 80));
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("partner_config"), partner.toBuffer()],
    programId,
  );
  if (!expected.equals(address))
    throw new Error("Bags partner account does not match its wallet PDA.");
  return PartnerConfigSchema.parse({
    partner: partner.toBase58(),
    feeCollectionMode: bytes.readUInt8(80),
    feeCollectionPlatformBps: bytes.readUInt16LE(81),
    bump: bytes.readUInt8(85),
    bps: bytes.readUInt16LE(86),
    totalClaimedFees: readU128(bytes, 8),
    totalAccumulatedFees: bytes.readBigUInt64LE(24),
    totalLifetimeAccumulatedFees: readU128(bytes, 32),
  });
}

export function assertPlatformOnlyPartner(
  config: PartnerConfig,
  wallet: string,
): void {
  if (
    config.partner !== wallet ||
    config.feeCollectionMode === 0 ||
    config.bps !== 0 ||
    config.feeCollectionPlatformBps <= 0
  ) {
    throw new Error(
      "Bags partner configuration must collect only from the platform pool, with a nonzero platform rate and no creator-pool deduction.",
    );
  }
}
