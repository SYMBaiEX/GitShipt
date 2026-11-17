import { Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeeShareAdminUpdateConfigInputSchema } from "./types";

const address = () => Keypair.generate().publicKey.toBase58();
const validInput = () => ({ baseMint: address(), payer: address(), feeClaimers: [{ wallet: address(), bps: 10_000 }] });

describe("fee-share admin update validation", () => {
  it("requires real public keys, unique wallets and exactly 10000 BPS", () => {
    const input = validInput();
    expect(FeeShareAdminUpdateConfigInputSchema.safeParse(input).success).toBe(true);
    expect(FeeShareAdminUpdateConfigInputSchema.safeParse({ ...input, baseMint: "x".repeat(32) }).success).toBe(false);
    expect(FeeShareAdminUpdateConfigInputSchema.safeParse({ ...input, feeClaimers: [{ ...input.feeClaimers[0]!, bps: 9999 }] }).success).toBe(false);
    expect(FeeShareAdminUpdateConfigInputSchema.safeParse({ ...input, feeClaimers: [{ ...input.feeClaimers[0]!, bps: 5000 }, { ...input.feeClaimers[0]!, bps: 5000 }] }).success).toBe(false);
  });
  it("deduplicates lookup tables", () => {
    const table = address();
    expect(FeeShareAdminUpdateConfigInputSchema.parse({ ...validInput(), additionalLookupTables: [table, table] }).additionalLookupTables).toEqual([table]);
  });
});

describe("fee-share admin update client", () => {
  afterEach(() => {
    vi.doUnmock("@bagsfm/bags-sdk");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/solana/signer");
  });

  it("retains Bags' existing transaction signature", async () => {
    vi.resetModules();
    const payer = Keypair.generate();
    const bagsSigner = Keypair.generate();
    const tx = new VersionedTransaction(new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: address(),
      instructions: [new TransactionInstruction({ programId: SystemProgram.programId, keys: [{ pubkey: bagsSigner.publicKey, isSigner: true, isWritable: false }], data: Buffer.alloc(0) })],
    }).compileToV0Message());
    tx.sign([bagsSigner]);
    const signature = Uint8Array.from(tx.signatures[1]!);
    const getUpdateConfigTransactions = vi.fn(async () => [{ transaction: tx, blockhash: { blockhash: address(), lastValidBlockHeight: 1 } }]);
    vi.doMock("@bagsfm/bags-sdk", () => ({ BagsSDK: class { feeShareAdmin = { getUpdateConfigTransactions, getAdminTokenMints: async () => [123] }; } }));
    vi.doMock("@/lib/env", () => ({ serverEnv: () => ({ BAGS_API_KEY: "test", HELIUS_RPC_URL: "https://example.com" }), hasCredentials: { bags: () => true }, canLaunchOnBags: () => ({ ok: true }), stubsAllowed: () => false }));
    vi.doMock("@/lib/solana/signer", () => ({ payoutSigner: vi.fn() }));
    const { bags } = await import("./client");
    const result = await bags.getUpdateFeeShareConfigTransactions({ ...validInput(), payer: payer.publicKey.toBase58() });
    expect(result[0]!.transaction).toBe(tx);
    expect(tx.signatures[1]).toEqual(signature);
    expect(signature.some((byte) => byte !== 0)).toBe(true);
    await expect(bags.getFeeShareAdminTokenMints(payer.publicKey.toBase58())).rejects.toThrow();
  });

  it("fails closed without credentials", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ serverEnv: () => ({}), hasCredentials: { bags: () => false }, canLaunchOnBags: () => ({ ok: false }), stubsAllowed: () => true }));
    vi.doMock("@/lib/solana/signer", () => ({ payoutSigner: vi.fn() }));
    const { bags } = await import("./client");
    await expect(bags.getUpdateFeeShareConfigTransactions(validInput())).rejects.toThrow("BAGS_API_KEY");
  });
});
