import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import { METEORA_DBC_PROGRAM_ID } from "@bagsfm/bags-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
const getTransaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/solana/connection", () => ({
  solanaConnection: () => ({ getTransaction }),
}));
import { verifyLaunchTransaction } from "./verify-launch";

const wallet = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const config = Keypair.generate().publicKey;
const input = {
  signature: "signature",
  launchWallet: wallet.toBase58(),
  tokenMint: mint.toBase58(),
  configKey: config.toBase58(),
};

function receipt(
  options: {
    payer?: PublicKey;
    program?: PublicKey;
    existed?: boolean;
    failed?: boolean;
  } = {},
): VersionedTransactionResponse {
  const message = new TransactionMessage({
    payerKey: options.payer ?? wallet,
    recentBlockhash: PublicKey.default.toBase58(),
    instructions: [
      new TransactionInstruction({
        programId: options.program ?? new PublicKey(METEORA_DBC_PROGRAM_ID),
        keys: [
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: config, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(0),
      }),
    ],
  }).compileToV0Message();
  const keys = message.staticAccountKeys;
  return {
    transaction: { message, signatures: [input.signature] },
    meta: {
      err: options.failed ? { InstructionError: [0, "InvalidArgument"] } : null,
      preBalances: keys.map((k) =>
        k.equals(mint) && !options.existed ? 0 : 1,
      ),
      postBalances: keys.map(() => 1),
      loadedAddresses: { readonly: [], writable: [] },
      fee: 1,
    },
    slot: 1,
    blockTime: 1,
    version: 0,
  };
}
afterEach(() => vi.resetAllMocks());
describe("launch receipt verification", () => {
  it("accepts a confirmed mint creation with the expected payer and configuration", async () => {
    getTransaction.mockResolvedValue(receipt());
    await expect(verifyLaunchTransaction(input)).resolves.toBeUndefined();
    expect(getTransaction).toHaveBeenCalledWith(input.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  });
  it("rejects an unconfirmed or missing transaction", async () => {
    getTransaction.mockResolvedValue(null);
    await expect(verifyLaunchTransaction(input)).rejects.toThrow(
      /not confirmed/,
    );
  });
  it("rejects failed transactions", async () => {
    getTransaction.mockResolvedValue(receipt({ failed: true }));
    await expect(verifyLaunchTransaction(input)).rejects.toThrow(
      /not confirmed/,
    );
  });
  it("rejects another wallet's receipt", async () => {
    getTransaction.mockResolvedValue(
      receipt({ payer: Keypair.generate().publicKey }),
    );
    await expect(verifyLaunchTransaction(input)).rejects.toThrow(/fee payer/);
  });
  it("rejects swaps against already existing mints", async () => {
    getTransaction.mockResolvedValue(receipt({ existed: true }));
    await expect(verifyLaunchTransaction(input)).rejects.toThrow(
      /does not create/,
    );
  });
  it("rejects transactions that do not invoke the Bags bonding curve", async () => {
    getTransaction.mockResolvedValue(receipt({ program: PublicKey.default }));
    await expect(verifyLaunchTransaction(input)).rejects.toThrow(
      /does not create/,
    );
  });
  it("rejects a different pool config", async () => {
    getTransaction.mockResolvedValue(receipt());
    await expect(
      verifyLaunchTransaction({
        ...input,
        configKey: Keypair.generate().publicKey.toBase58(),
      }),
    ).rejects.toThrow(/does not create/);
  });
});
