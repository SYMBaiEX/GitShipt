/**
 * Anchor-based on-chain client for the Bags `fee-share-v2` program.
 *
 * Why this exists:
 * Bags' HTTP API exposes `update-config` (admin-gated) and `transfer-tx`
 * (admin transfer) but does NOT expose the program's manager-pattern
 * instructions (`update_fee_config_manager`, `manager_update_fee_config`,
 * `manager_transfer_fee_config`, `manager_waive_fee_config`). The
 * official `bags-cli` reference integration uses the admin role for
 * everything for that reason.
 *
 * The on-chain program nevertheless implements a proper manager role
 * with strictly narrower authority (BPS rebalance only — cannot drain
 * funds, cannot replace claimer pubkeys, cannot set partner, cannot
 * reassign admin). Per the SPEC's principle-of-least-privilege
 * stance and docs/adr/0001-bags-native-payout.md, GitShipt holds the
 * manager role, NOT the admin role. The launch wallet (project owner)
 * remains admin and can revoke manager via `update_fee_config_manager`
 * if our keypair is ever compromised.
 *
 * This module builds the Anchor instructions directly using the IDL
 * bundled with `@bagsfm/bags-sdk`. It returns `TransactionInstruction`s;
 * higher-level wrappers compose them into versioned transactions and
 * sign with the appropriate keypair (admin keypair for the launch-time
 * `setManager` call, manager keypair for ongoing rebalances).
 *
 * IDL deep-import path is the same as program-events.ts; re-verify
 * after every Bags SDK upgrade.
 */

import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json";
import type { BagsFeeShare } from "@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl";

const FEE_SHARE_V2_PROGRAM_ID = new PublicKey(
  (idlJson as { address: string }).address,
);

const PROGRAM_CONFIG_SEED = Buffer.from("program_config");
const FEE_SHARE_CONFIG_SEED = Buffer.from("fee_share_config");
const FEE_SHARE_AUTHORITY_SEED = Buffer.from("fee_share_authority");
// Anchor convention: events are emitted via a CPI to the program itself
// signed by this PDA. Anchor calls it `__event_authority`.
const EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

/** WSOL — currently the only quote mint Bags supports per IDL field doc. */
export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

export const BAGS_FEE_SHARE_V2_PROGRAM_ID = FEE_SHARE_V2_PROGRAM_ID;

// --- PDA derivations -------------------------------------------------------

export function deriveProgramConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_CONFIG_SEED],
    FEE_SHARE_V2_PROGRAM_ID,
  );
}

export function deriveFeeShareConfigPda(
  baseMint: PublicKey,
  quoteMint: PublicKey = WSOL_MINT,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_SHARE_CONFIG_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    FEE_SHARE_V2_PROGRAM_ID,
  );
}

export function deriveFeeShareAuthorityPda(
  baseMint: PublicKey,
  quoteMint: PublicKey = WSOL_MINT,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_SHARE_AUTHORITY_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    FEE_SHARE_V2_PROGRAM_ID,
  );
}

export function deriveEventAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EVENT_AUTHORITY_SEED],
    FEE_SHARE_V2_PROGRAM_ID,
  );
}

// --- Anchor program instance ----------------------------------------------

// Read-only stub wallet — building instructions never signs, but
// AnchorProvider.constructor requires a wallet instance.
class ReadonlyWallet {
  publicKey: PublicKey;
  constructor(publicKey: PublicKey) {
    this.publicKey = publicKey;
  }
  async signTransaction<T>(): Promise<T> {
    throw new Error("ReadonlyWallet cannot sign transactions");
  }
  async signAllTransactions<T>(): Promise<T[]> {
    throw new Error("ReadonlyWallet cannot sign transactions");
  }
}

let _program: Program<BagsFeeShare> | null = null;
let _programConnection: Connection | null = null;

/**
 * Lazily construct the Anchor `Program` instance for fee-share-v2.
 * Typed against the SDK's bundled `BagsFeeShare` IDL type so that
 * `program.methods.<ix>` is fully narrowed (no `Record<string, fn | undefined>`).
 *
 * Memoized per (connection identity) — pass a fresh connection to invalidate.
 */
export function getFeeShareV2Program(
  connection: Connection,
): Program<BagsFeeShare> {
  if (_program && _programConnection === connection) return _program;
  const wallet = new ReadonlyWallet(Keypair.generate().publicKey);
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment: connection.commitment ?? "processed",
  });
  _program = new Program<BagsFeeShare>(
    idlJson as unknown as BagsFeeShare,
    provider,
  );
  _programConnection = connection;
  return _program;
}

/**
 * Reset the memoized Program instance. Tests should call this in
 * beforeEach/afterEach to ensure clean state between cases.
 */
export function __resetProgramForTests(): void {
  _program = null;
  _programConnection = null;
}

// --- Instruction builders --------------------------------------------------

export interface SetManagerArgs {
  connection: Connection;
  /** The on-chain admin (typically the launching wallet's pubkey). */
  admin: PublicKey;
  /** Pays for the tx; usually the same as `admin`. */
  payer: PublicKey;
  /** The new manager pubkey to set on this fee-share config. */
  newManager: PublicKey;
  baseMint: PublicKey;
  quoteMint?: PublicKey;
}

/**
 * Build a `update_fee_config_manager` instruction.
 *
 * Admin-gated: caller MUST be the on-chain admin of the fee-share config
 * (which is the launching wallet immediately post-launch, or whoever it
 * was last transferred to via `getTransferAdminTransaction`).
 *
 * After this instruction lands, the `newManager` pubkey can call
 * `manager_update_fee_config`, `manager_transfer_fee_config`, and
 * `manager_waive_fee_config`. The admin retains the ability to call
 * this instruction again to rotate or revoke the manager.
 */
export async function buildSetManagerIx(
  args: SetManagerArgs,
): Promise<TransactionInstruction> {
  const program = getFeeShareV2Program(args.connection);
  const quoteMint = args.quoteMint ?? WSOL_MINT;
  const [programConfig] = deriveProgramConfigPda();
  const [feeShareConfig] = deriveFeeShareConfigPda(args.baseMint, quoteMint);
  const [feeShareAuthority] = deriveFeeShareAuthorityPda(
    args.baseMint,
    quoteMint,
  );
  const [eventAuthority] = deriveEventAuthorityPda();

  // Anchor 0.30+ converts snake_case IDL ix names to camelCase methods.
  return program.methods
    .updateFeeConfigManager()
    .accountsStrict({
      payer: args.payer,
      admin: args.admin,
      programConfig,
      feeShareConfig,
      feeShareAuthority,
      newManager: args.newManager,
      baseMint: args.baseMint,
      quoteMint,
      systemProgram: PublicKey.default,
      eventAuthority,
      program: FEE_SHARE_V2_PROGRAM_ID,
    })
    .instruction();
}

export interface ManagerUpdateFeeConfigArgs {
  connection: Connection;
  /** Caller MUST be the manager set via `setManager` previously. */
  manager: PublicKey;
  /** Pays for the tx; usually the same as `manager`. */
  payer: PublicKey;
  baseMint: PublicKey;
  quoteMint?: PublicKey;
  /** New BPS values for the slot range [fromIdx, toIdx]. */
  bps: number[];
  /** Inclusive start of the slot range to update. */
  fromIdx: number;
  /** Inclusive end of the slot range to update. */
  toIdx: number;
  /**
   * If true, this is the FINAL update — the program will refuse all
   * future BPS updates. Permanent. **Almost never want this true.**
   */
  finalizeUpdate: boolean;
}

/**
 * Build a `manager_update_fee_config` instruction (BPS rebalance).
 *
 * Manager-gated: caller MUST be the manager set via `setManager`.
 *
 * Updates the BPS array entries in the inclusive range
 * `[fromIdx, toIdx]`. The provided `bps` vector length must equal
 * `toIdx - fromIdx + 1`. To rebalance every slot, pass
 * `fromIdx=0, toIdx=N-1` where N is the current claimer count.
 *
 * Pre-checks the caller's responsibility:
 *  - bps.length === toIdx - fromIdx + 1
 *  - sum of the FULL post-update bps array (across all slots) === 10000
 *  - no slot being touched has accrued fees (per IDL error 6017
 *    `CannotChangeClaimerIndexWithFees`) — actually applies to index
 *    *change*, not BPS change. Setting a claimer's bps to 0 is allowed
 *    and is the way to "drop" them out of future fee accrual.
 */
export async function buildManagerUpdateFeeConfigIx(
  args: ManagerUpdateFeeConfigArgs,
): Promise<TransactionInstruction> {
  if (args.toIdx < args.fromIdx) {
    throw new Error("toIdx must be >= fromIdx");
  }
  const expectedLen = args.toIdx - args.fromIdx + 1;
  if (args.bps.length !== expectedLen) {
    throw new Error(
      `bps vector length ${args.bps.length} does not match slot range size ${expectedLen}`,
    );
  }
  for (const v of args.bps) {
    if (!Number.isInteger(v) || v < 0 || v > 10_000) {
      throw new Error(`bps values must be integers in [0, 10000]; got ${v}`);
    }
  }
  if (args.fromIdx < 0 || args.toIdx > 255) {
    throw new Error("slot indices must fit in u8 (0..=255)");
  }

  const program = getFeeShareV2Program(args.connection);
  const quoteMint = args.quoteMint ?? WSOL_MINT;
  const [feeShareConfig] = deriveFeeShareConfigPda(args.baseMint, quoteMint);
  const [feeShareAuthority] = deriveFeeShareAuthorityPda(
    args.baseMint,
    quoteMint,
  );
  const [eventAuthority] = deriveEventAuthorityPda();

  return program.methods
    .managerUpdateFeeConfig({
      bps: args.bps,
      finalizeUpdate: args.finalizeUpdate,
      fromIdx: args.fromIdx,
      toIdx: args.toIdx,
    })
    .accountsStrict({
      payer: args.payer,
      manager: args.manager,
      feeShareConfig,
      feeShareAuthority,
      baseMint: args.baseMint,
      quoteMint,
      systemProgram: PublicKey.default,
      eventAuthority,
      program: FEE_SHARE_V2_PROGRAM_ID,
    })
    .instruction();
}

export interface ManagerTransferArgs {
  connection: Connection;
  manager: PublicKey;
  payer: PublicKey;
  newManager: PublicKey;
  baseMint: PublicKey;
  quoteMint?: PublicKey;
}

/**
 * Build a `manager_transfer_fee_config` instruction.
 *
 * Manager-gated: lets the current manager hand the role to a new pubkey
 * without involving the admin. Use for routine key rotation (e.g. quarterly
 * manager keypair refresh) or planned operator handoff.
 *
 * If you need an emergency revoke instead — i.e. the admin (project owner)
 * wants to forcibly take the role back from a compromised manager — that's
 * the `update_fee_config_manager` instruction, signed by the admin, with
 * the admin or a fresh keypair as the new manager.
 */
export async function buildManagerTransferIx(
  args: ManagerTransferArgs,
): Promise<TransactionInstruction> {
  const program = getFeeShareV2Program(args.connection);
  const quoteMint = args.quoteMint ?? WSOL_MINT;
  const [feeShareConfig] = deriveFeeShareConfigPda(args.baseMint, quoteMint);
  const [feeShareAuthority] = deriveFeeShareAuthorityPda(
    args.baseMint,
    quoteMint,
  );
  const [eventAuthority] = deriveEventAuthorityPda();

  return program.methods
    .managerTransferFeeConfig()
    .accountsStrict({
      payer: args.payer,
      manager: args.manager,
      newManager: args.newManager,
      feeShareConfig,
      feeShareAuthority,
      baseMint: args.baseMint,
      quoteMint,
      systemProgram: PublicKey.default,
      eventAuthority,
      program: FEE_SHARE_V2_PROGRAM_ID,
    })
    .instruction();
}

export interface ManagerWaiveArgs {
  connection: Connection;
  manager: PublicKey;
  payer: PublicKey;
  baseMint: PublicKey;
  quoteMint?: PublicKey;
}

/**
 * Build a `manager_waive_fee_config` instruction.
 *
 * Manager-gated: the current manager voluntarily gives the role back to
 * the admin (clears the manager slot on the config). After this lands,
 * the admin is the only role that can update BPS until they call
 * `update_fee_config_manager` to delegate to a new keypair.
 *
 * Use case: scheduled wind-down of automated rebalancing, or operator
 * exit. The "I think my key is leaking — abandon ship" call.
 */
export async function buildManagerWaiveIx(
  args: ManagerWaiveArgs,
): Promise<TransactionInstruction> {
  const program = getFeeShareV2Program(args.connection);
  const quoteMint = args.quoteMint ?? WSOL_MINT;
  const [feeShareConfig] = deriveFeeShareConfigPda(args.baseMint, quoteMint);
  const [feeShareAuthority] = deriveFeeShareAuthorityPda(
    args.baseMint,
    quoteMint,
  );
  const [eventAuthority] = deriveEventAuthorityPda();

  return program.methods
    .managerWaiveFeeConfig()
    .accountsStrict({
      payer: args.payer,
      manager: args.manager,
      feeShareConfig,
      feeShareAuthority,
      baseMint: args.baseMint,
      quoteMint,
      systemProgram: PublicKey.default,
      eventAuthority,
      program: FEE_SHARE_V2_PROGRAM_ID,
    })
    .instruction();
}

// Re-export BN so callers needing to pass program-defined types (none today,
// but future-proof for ix args that take u64) don't have to import anchor.
export { BN };
