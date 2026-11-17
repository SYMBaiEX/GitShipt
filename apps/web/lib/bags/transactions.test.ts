import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  assertBagsTransactionSafeToSign,
  normalizeBagsTransaction,
} from "./transactions";

const RECENT_BLOCKHASH = "11111111111111111111111111111111";
const FEE_SHARE_V2_PROGRAM_ID = new PublicKey(
  "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK",
);
const CLAIM_USER_DISCRIMINATOR = Uint8Array.from([
  164, 64, 55, 199, 90, 78, 147, 188,
]);
const UPDATE_FEE_CONFIG_DISCRIMINATOR = Uint8Array.from([
  104, 184, 103, 242, 88, 151, 107, 20,
]);

function legacyTransaction(): Transaction {
  const payer = Keypair.generate();
  return new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: RECENT_BLOCKHASH,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: 1,
    }),
  );
}

function versionedTransaction(): VersionedTransaction {
  const payer = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: RECENT_BLOCKHASH,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports: 1,
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

function bagsInstructionTransaction(data: Uint8Array): Transaction {
  const signer = Keypair.generate();
  const tx = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: RECENT_BLOCKHASH,
  }).add(
    new TransactionInstruction({
      programId: FEE_SHARE_V2_PROGRAM_ID,
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from(data),
    }),
  );
  tx.sign(signer);
  return tx;
}

describe("normalizeBagsTransaction", () => {
  it("normalizes actual Bags SDK Solana instances while preserving partial signatures", async () => {
    const require = createRequire(import.meta.url);
    const bagsRequire = createRequire(require.resolve("@bagsfm/bags-sdk"));
    const sdkWeb3 = bagsRequire(
      "@solana/web3.js",
    ) as typeof import("@solana/web3.js");
    expect(sdkWeb3.VersionedTransaction).toBe(VersionedTransaction);
    expect(sdkWeb3.Transaction).toBe(Transaction);

    const payer = sdkWeb3.Keypair.generate();
    const cosigner = sdkWeb3.Keypair.generate();
    const instruction = new sdkWeb3.TransactionInstruction({
      programId: sdkWeb3.SystemProgram.programId,
      keys: [{ pubkey: cosigner.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.alloc(0),
    });
    const legacy = new sdkWeb3.Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(instruction);
    legacy.partialSign(payer);
    const message = new sdkWeb3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
      instructions: [instruction],
    }).compileToV0Message();
    const versioned = new sdkWeb3.VersionedTransaction(message);
    versioned.sign([payer]);

    for (const tx of [legacy, versioned]) {
      const bytes =
        tx instanceof sdkWeb3.Transaction
          ? tx.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            })
          : tx.serialize();
      const normalized = await normalizeBagsTransaction(tx);
      expect(normalized).toBe(tx);
      const normalizedBytes =
        normalized instanceof Transaction
          ? normalized.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            })
          : normalized.serialize();
      expect(Buffer.from(normalizedBytes)).toEqual(Buffer.from(bytes));
      const originalSignature =
        tx instanceof sdkWeb3.Transaction
          ? tx.signatures[0]?.signature
          : tx.signatures[0];
      expect(originalSignature).toBeTruthy();
      const normalizedSignature =
        normalized instanceof Transaction
          ? normalized.signatures[0]?.signature
          : normalized.signatures[0];
      expect(normalizedSignature).toEqual(originalSignature);
    }
  });

  it("rejects invalid serialized bytes from foreign objects", async () => {
    await expect(
      normalizeBagsTransaction({ serialize: () => "not bytes" }),
    ).rejects.toThrow(/invalid serialized transaction bytes/);
    await expect(
      normalizeBagsTransaction({ serialize: () => Uint8Array.of(1, 2, 3) }),
    ).rejects.toThrow(/unsupported serialized transaction/);
  });

  it("applies signer safety checks after normalizing a foreign transaction", async () => {
    const require = createRequire(import.meta.url);
    const sdkWeb3 = createRequire(require.resolve("@bagsfm/bags-sdk"))(
      "@solana/web3.js",
    ) as typeof import("@solana/web3.js");
    const signer = sdkWeb3.Keypair.generate();
    const tx = new sdkWeb3.Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(
      sdkWeb3.SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: sdkWeb3.Keypair.generate().publicKey,
        lamports: 1,
      }),
    );
    const normalized = await normalizeBagsTransaction({
      serialize: () =>
        tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    });
    await expect(
      assertBagsTransactionSafeToSign(
        normalized,
        new PublicKey(signer.publicKey.toBytes()),
      ),
    ).rejects.toThrow(/direct SOL transfer/);
  });

  it("passes through legacy Transaction instances", async () => {
    const tx = legacyTransaction();

    await expect(normalizeBagsTransaction(tx)).resolves.toBe(tx);
  });

  it("passes through VersionedTransaction instances", async () => {
    const tx = versionedTransaction();

    await expect(normalizeBagsTransaction(tx)).resolves.toBe(tx);
  });

  it("normalizes base58 serialized transaction envelopes", async () => {
    const serialized = versionedTransaction().serialize();
    const normalized = await normalizeBagsTransaction({
      transaction: bs58.encode(serialized),
    });

    expect(normalized).toBeInstanceOf(VersionedTransaction);
    expect((normalized as VersionedTransaction).version).toBe(0);
  });

  it("normalizes base64 serialized claim tx envelopes", async () => {
    const legacy = legacyTransaction().serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const normalized = await normalizeBagsTransaction({
      tx: Buffer.from(legacy).toString("base64"),
    });

    expect(normalized).toBeInstanceOf(VersionedTransaction);
    expect((normalized as VersionedTransaction).version).toBe("legacy");
  });
});

describe("assertBagsTransactionSafeToSign", () => {
  it("rejects transactions that do not require the payout signer", async () => {
    const signer = Keypair.generate();
    const tx = legacyTransaction();

    await expect(
      assertBagsTransactionSafeToSign(tx, signer.publicKey, {
        operation: "claim",
      }),
    ).rejects.toThrow(/does not require the payout signer/);
  });

  it("rejects direct SOL transfers from the payout signer by default", async () => {
    const signer = Keypair.generate();
    const tx = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    );
    tx.sign(signer);

    await expect(
      assertBagsTransactionSafeToSign(tx, signer.publicKey, {
        operation: "claim",
      }),
    ).rejects.toThrow(/direct SOL transfer from the payout signer/);
  });

  it("allows signer SOL transfers only when the caller explicitly opts in", async () => {
    const signer = Keypair.generate();
    const tx = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    );
    tx.sign(signer);

    await expect(
      assertBagsTransactionSafeToSign(tx, signer.publicKey, {
        operation: "launch",
        allowSignerSystemTransfer: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("allows expected Bags Fee Share v2 instructions for the selected policy", async () => {
    const signer = Keypair.generate();
    const tx = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(
      new TransactionInstruction({
        programId: FEE_SHARE_V2_PROGRAM_ID,
        keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from(CLAIM_USER_DISCRIMINATOR),
      }),
    );
    tx.sign(signer);

    await expect(
      assertBagsTransactionSafeToSign(tx, signer.publicKey, {
        operation: "claim",
        bagsInstructionPolicy: "fee-claim",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects Bags Fee Share v2 instructions outside the selected policy", async () => {
    const tx = bagsInstructionTransaction(UPDATE_FEE_CONFIG_DISCRIMINATOR);
    const signer = tx.signatures[0]?.publicKey;
    expect(signer).toBeDefined();

    await expect(
      assertBagsTransactionSafeToSign(tx, signer!, {
        operation: "claim",
        bagsInstructionPolicy: "fee-claim",
      }),
    ).rejects.toThrow(/unsupported Bags Fee Share v2 instruction/);
  });

  it("requires a Bags Fee Share v2 instruction when a policy is requested", async () => {
    const signer = Keypair.generate();
    const tx = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: RECENT_BLOCKHASH,
    }).add(
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from([0, 0, 0, 0]),
      }),
    );
    tx.sign(signer);

    await expect(
      assertBagsTransactionSafeToSign(tx, signer.publicKey, {
        operation: "claim",
        bagsInstructionPolicy: "fee-claim",
      }),
    ).rejects.toThrow(/without a Bags Fee Share v2 fee-claim instruction/);
  });
});
