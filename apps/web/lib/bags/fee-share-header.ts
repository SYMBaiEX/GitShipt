import { PublicKey } from "@solana/web3.js";
import { BAGS_FEE_SHARE_V2_PROGRAM_ID } from "./program-client";

const DISCRIMINATOR = Buffer.from([40, 71, 136, 156, 222, 49, 31, 201]);
const HEADER_BYTES = 184;

/** Validates only the documented zero-copy header, not the variable claimer payload. */
export function verifyFeeShareHeader(input: {
  owner: PublicKey;
  data: Buffer;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  partner: PublicKey;
  partnerConfig: PublicKey;
}): { manager: PublicKey } {
  const { data } = input;
  if (!input.owner.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID))
    throw new Error("Unexpected fee-share program owner.");
  if (data.length < HEADER_BYTES || !data.subarray(0, 8).equals(DISCRIMINATOR))
    throw new Error("Invalid fee-share header.");
  const check = (offset: number, expected: PublicKey, field: string) => {
    if (!new PublicKey(data.subarray(offset, offset + 32)).equals(expected))
      throw new Error(`Fee-share ${field} mismatch.`);
  };
  check(8, input.baseMint, "base mint");
  check(40, input.quoteMint, "quote mint");
  check(72, input.partner, "partner");
  check(104, input.partnerConfig, "partner config");
  if (data[176] !== 1)
    throw new Error("Fee-share initialization is not finalized.");
  if (data[177] !== 0) throw new Error("Fee-share configuration is locked.");
  return { manager: new PublicKey(data.subarray(136, 168)) };
}
