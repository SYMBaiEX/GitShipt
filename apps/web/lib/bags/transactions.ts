import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

export type BagsTransaction = Transaction | VersionedTransaction;
export type BagsInstructionPolicy =
  "none" | "fee-claim" | "partner-claim" | "fee-config";

type Web3Module = typeof import("@solana/web3.js");
type StaticMessage = {
  header: { numRequiredSignatures: number };
  staticAccountKeys: PublicKey[];
  addressTableLookups?: unknown[];
  compiledInstructions: Array<{
    programIdIndex: number;
    accountKeyIndexes?: number[];
    data: Uint8Array;
  }>;
};

const BAGS_FEE_SHARE_V2_PROGRAM_ID =
  "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK";

const FEE_SHARE_V2_DISCRIMINATORS = {
  claim_damm_v2: "232,175,106,19,168,54,186,108",
  claim_dbc: "229,142,38,65,198,50,110,58",
  claim_partner: "181,78,148,221,100,54,21,114",
  claim_platform_fees: "159,129,37,35,170,99,163,16",
  claim_user: "164,64,55,199,90,78,147,188",
  create_fee_config: "214,172,105,64,8,228,209,204",
  extend_created_fee_config: "205,172,113,254,225,59,82,79",
  force_claim_user: "216,217,173,83,118,151,252,48",
  force_sol_claim_user: "78,63,180,4,151,16,107,241",
  update_fee_config: "104,184,103,242,88,151,107,20",
} as const;

const POLICY_DISCRIMINATORS: Record<BagsInstructionPolicy, Set<string>> = {
  none: new Set(),
  "fee-claim": new Set([
    FEE_SHARE_V2_DISCRIMINATORS.claim_damm_v2,
    FEE_SHARE_V2_DISCRIMINATORS.claim_dbc,
    FEE_SHARE_V2_DISCRIMINATORS.claim_platform_fees,
    FEE_SHARE_V2_DISCRIMINATORS.claim_user,
    FEE_SHARE_V2_DISCRIMINATORS.force_claim_user,
    FEE_SHARE_V2_DISCRIMINATORS.force_sol_claim_user,
  ]),
  "partner-claim": new Set([
    FEE_SHARE_V2_DISCRIMINATORS.claim_damm_v2,
    FEE_SHARE_V2_DISCRIMINATORS.claim_dbc,
    FEE_SHARE_V2_DISCRIMINATORS.claim_partner,
  ]),
  "fee-config": new Set([
    FEE_SHARE_V2_DISCRIMINATORS.create_fee_config,
    FEE_SHARE_V2_DISCRIMINATORS.extend_created_fee_config,
    FEE_SHARE_V2_DISCRIMINATORS.update_fee_config,
  ]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function nestedTransactionCandidate(value: Record<string, unknown>): unknown {
  return (
    value.transaction ??
    value.tx ??
    value.swapTransaction ??
    value.serializedTransaction ??
    value.response
  );
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function deserializeBytes(
  bytes: Uint8Array,
  web3: Web3Module,
): BagsTransaction {
  const errors: string[] = [];

  try {
    return web3.VersionedTransaction.deserialize(bytes);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    return web3.Transaction.from(bytes);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(
    `Bags returned an unsupported serialized transaction: ${errors.join("; ")}`,
  );
}

function deserializeString(value: string, web3: Web3Module): BagsTransaction {
  const trimmed = value.trim();
  const errors: string[] = [];

  for (const decode of [
    () => bs58.decode(trimmed),
    () => decodeBase64(trimmed),
  ]) {
    try {
      return deserializeBytes(decode(), web3);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Bags returned an unsupported serialized transaction string: ${errors.join("; ")}`,
  );
}

export async function normalizeBagsTransaction(
  transaction: unknown,
): Promise<BagsTransaction> {
  const web3 = await import("@solana/web3.js");

  if (
    transaction instanceof web3.VersionedTransaction ||
    transaction instanceof web3.Transaction
  ) {
    return transaction;
  }

  if (typeof transaction === "string") {
    return deserializeString(transaction, web3);
  }

  if (transaction instanceof Uint8Array || Buffer.isBuffer(transaction)) {
    return deserializeBytes(transaction, web3);
  }

  if (Array.isArray(transaction)) {
    return deserializeBytes(Uint8Array.from(transaction), web3);
  }

  if (isRecord(transaction)) {
    if (typeof transaction.serialize === "function") {
      const bytes: unknown = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
        throw new Error("Bags returned invalid serialized transaction bytes.");
      }
      return deserializeBytes(bytes, web3);
    }
    const candidate = nestedTransactionCandidate(transaction);
    if (candidate !== undefined && candidate !== transaction) {
      return normalizeBagsTransaction(candidate);
    }
  }

  throw new Error("Bags returned an unsupported transaction type.");
}

function isStaticMessage(message: unknown): message is StaticMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as {
    header?: unknown;
    staticAccountKeys?: unknown;
    compiledInstructions?: unknown;
  };
  return (
    Boolean(candidate.header) &&
    Array.isArray(candidate.staticAccountKeys) &&
    Array.isArray(candidate.compiledInstructions)
  );
}

function systemInstructionKind(data: Uint8Array): number | null {
  if (data.byteLength < 4) return null;
  return Buffer.from(data).readUInt32LE(0);
}

function discriminatorKey(data: Uint8Array): string | null {
  if (data.byteLength < 8) return null;
  return Array.from(data.slice(0, 8)).join(",");
}

function assertKnownBagsFeeShareInstructions(
  transaction: BagsTransaction,
  web3: Web3Module,
  operation: string,
  policy: BagsInstructionPolicy | undefined,
): void {
  if (!policy || policy === "none") return;
  const allowed = POLICY_DISCRIMINATORS[policy];
  const feeShareProgram = new web3.PublicKey(BAGS_FEE_SHARE_V2_PROGRAM_ID);
  let sawFeeShareInstruction = false;

  if (transaction instanceof web3.Transaction) {
    for (const instruction of transaction.instructions) {
      if (!instruction.programId.equals(feeShareProgram)) continue;
      sawFeeShareInstruction = true;
      const discriminator = discriminatorKey(instruction.data);
      if (!discriminator || !allowed.has(discriminator)) {
        throw new Error(
          `${operation}: refusing to sign unsupported Bags Fee Share v2 instruction for ${policy}.`,
        );
      }
    }
  } else if (isStaticMessage(transaction.message)) {
    const keys = transaction.message.staticAccountKeys;
    for (const instruction of transaction.message.compiledInstructions) {
      const program = keys[instruction.programIdIndex];
      if (
        !program &&
        (transaction.message.addressTableLookups?.length ?? 0) > 0
      ) {
        throw new Error(
          `${operation}: refusing to validate Bags instruction whose program id is only available through an unresolved address lookup table.`,
        );
      }
      if (!program?.equals(feeShareProgram)) continue;
      sawFeeShareInstruction = true;
      const discriminator = discriminatorKey(instruction.data);
      if (!discriminator || !allowed.has(discriminator)) {
        throw new Error(
          `${operation}: refusing to sign unsupported Bags Fee Share v2 instruction for ${policy}.`,
        );
      }
    }
  }

  if (!sawFeeShareInstruction) {
    throw new Error(
      `${operation}: refusing to sign transaction without a Bags Fee Share v2 ${policy} instruction.`,
    );
  }
}

function assertSignerIsRequired(
  transaction: BagsTransaction,
  signer: PublicKey,
  web3: Web3Module,
  operation: string,
): void {
  const requiredSigners =
    transaction instanceof web3.Transaction
      ? transaction.signatures.map((sig) => sig.publicKey)
      : isStaticMessage(transaction.message)
        ? transaction.message.staticAccountKeys.slice(
            0,
            transaction.message.header.numRequiredSignatures,
          )
        : [];

  if (!requiredSigners.some((key) => key.equals(signer))) {
    throw new Error(
      `${operation}: refusing to sign transaction that does not require the payout signer.`,
    );
  }
}

function assertNoSignerSystemTransfer(
  transaction: BagsTransaction,
  signer: PublicKey,
  web3: Web3Module,
  operation: string,
): void {
  if (transaction instanceof web3.Transaction) {
    for (const instruction of transaction.instructions) {
      if (!instruction.programId.equals(web3.SystemProgram.programId)) continue;
      const kind = systemInstructionKind(instruction.data);
      const from = instruction.keys[0]?.pubkey;
      if (kind === 2 && from?.equals(signer)) {
        throw new Error(
          `${operation}: refusing to sign Bags transaction with a direct SOL transfer from the payout signer.`,
        );
      }
    }
    return;
  }

  if (!isStaticMessage(transaction.message)) return;
  const keys = transaction.message.staticAccountKeys;
  for (const instruction of transaction.message.compiledInstructions) {
    const program = keys[instruction.programIdIndex];
    if (!program?.equals(web3.SystemProgram.programId)) continue;
    const kind = systemInstructionKind(instruction.data);
    const accountIndexes = instruction.accountKeyIndexes;
    const fromIndex = accountIndexes?.[0];
    const from = fromIndex === undefined ? undefined : keys[fromIndex];
    if (kind === 2 && from?.equals(signer)) {
      throw new Error(
        `${operation}: refusing to sign Bags transaction with a direct SOL transfer from the payout signer.`,
      );
    }
  }
}

export async function assertBagsTransactionSafeToSign(
  transaction: BagsTransaction,
  signer: PublicKey,
  options?: {
    operation?: string;
    allowSignerSystemTransfer?: boolean;
    bagsInstructionPolicy?: BagsInstructionPolicy;
  },
): Promise<void> {
  const web3 = await import("@solana/web3.js");
  const operation = options?.operation ?? "Bags transaction";
  assertSignerIsRequired(transaction, signer, web3, operation);
  assertKnownBagsFeeShareInstructions(
    transaction,
    web3,
    operation,
    options?.bagsInstructionPolicy,
  );
  if (!options?.allowSignerSystemTransfer) {
    assertNoSignerSystemTransfer(transaction, signer, web3, operation);
  }
}
