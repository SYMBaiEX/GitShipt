/**
 * v1.1 launch integration helpers.
 *
 * Two concerns, three public functions:
 *
 *  1. `mirrorLaunchToV11Tables` — given a successful v1.0-style Bags launch
 *     (the legacy `executePayout`-shaped flow that currently runs in
 *     `app/(public)/launch/actions.ts`), populate the v1.1 mirror tables:
 *     bags_fee_share_configs, bags_claimer_slots, payout_schedules. Idempotent
 *     on (project_id) — re-running for the same project is a no-op.
 *
 *  2. `prepareManagerDelegationTransaction` — builds the unsigned
 *     `update_fee_config_manager` instruction for the project owner (admin)
 *     to sign in their browser wallet. Sets the GitShipt manager keypair as
 *     the on-chain manager. Returns base64-serialized v0 tx + the manager
 *     pubkey expected to land in `bags_fee_share_configs.manager_pubkey`.
 *
 *  3. `confirmManagerDelegation` — after the project owner broadcasts the
 *     signed tx, verifies on-chain that the config's manager now matches the
 *     manager keypair, then updates the config row + writes the audit entry.
 *
 * Shared between two callers:
 *   - The launch wizard's post-confirmation server action (going forward).
 *   - The Phase 5 cutover script (existing live projects).
 */

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { dbHttp } from "@/db";
import {
  bagsClaimerProviderEnum,
  bagsClaimerSlots,
  bagsFeeShareConfigs,
  payoutSchedules,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { serverEnv, hasCredentials } from "@/lib/env";
import {
  buildSetManagerIx,
  deriveFeeShareAuthorityPda,
  deriveFeeShareConfigPda,
  WSOL_MINT,
} from "@/lib/bags/program-client";
import { managerSigner } from "@/lib/solana/manager-signer";

type ClaimerProvider = (typeof bagsClaimerProviderEnum.enumValues)[number];

const RAMP_UP_FIRST_RUN_HOURS = 24; // Initial payout window after launch.

// ---------------------------------------------------------------------------

export interface MirrorClaimerInput {
  /** 0..N-1 in the order the claimers appear in the on-chain claimers[]. */
  slotIndex: number;
  /** The on-chain claimer pubkey (Bags-managed PDA for social handles, or
   *  the launcher-supplied wallet for direct-wallet claimers). */
  claimerPubkey: string;
  provider: ClaimerProvider;
  socialHandle: string | null;
  contributorId: string | null;
  /** BPS at launch time. Sum across all claimers must equal 10000. */
  initialBps: number;
}

export interface MirrorLaunchInput {
  projectId: string;
  baseMint: string;
  /** Project owner / launching wallet (initial on-chain admin). */
  adminPubkey: string;
  claimers: MirrorClaimerInput[];
  /** 72 (3d) | 120 (5d) | 168 (7d). v1.1 default is 72. */
  steadyStateCadenceHours: 72 | 120 | 168;
}

export interface MirrorLaunchResult {
  feeShareConfigId: string;
  payoutScheduleId: string;
  feeShareConfigPda: string;
  /** True if a row already existed and was returned unchanged. */
  alreadyMirrored: boolean;
}

/**
 * Populate the v1.1 mirror tables for a successfully-launched project.
 *
 * Validates that:
 *  - claimers.length is 1..100
 *  - sum of initialBps is exactly 10000
 *  - slotIndex values are unique and dense (0..N-1)
 *  - no duplicate claimer pubkeys
 *
 * Computes the on-chain PDAs (fee_share_config, fee_share_authority) from
 * the IDL-derived seed scheme — same derivation Bags' on-chain program
 * uses. Sets payout_schedules.next_run_at to now + 24h (the v1.1 first-run
 * gratification window per the cadence ramp-up).
 *
 * Idempotency: if a bags_fee_share_configs row already exists for this
 * project, returns its IDs unchanged. Use `confirmManagerDelegation` to
 * record the manager-set step separately.
 */
export async function mirrorLaunchToV11Tables(
  input: MirrorLaunchInput,
): Promise<MirrorLaunchResult> {
  validateMirrorInput(input);

  const existing = await dbHttp
    .select()
    .from(bagsFeeShareConfigs)
    .where(eq(bagsFeeShareConfigs.projectId, input.projectId))
    .limit(1);
  if (existing[0]) {
    const cfg = existing[0];
    const sched = await dbHttp
      .select({ id: payoutSchedules.id })
      .from(payoutSchedules)
      .where(eq(payoutSchedules.projectId, input.projectId))
      .limit(1);
    return {
      feeShareConfigId: cfg.id,
      payoutScheduleId: sched[0]?.id ?? "",
      feeShareConfigPda: cfg.feeShareConfigPda,
      alreadyMirrored: true,
    };
  }

  const baseMintPk = new PublicKey(input.baseMint);
  const [feeShareConfigPda] = deriveFeeShareConfigPda(baseMintPk);
  const [feeShareAuthorityPda] = deriveFeeShareAuthorityPda(baseMintPk);

  // Single transaction in spirit — Drizzle pool transactions would be
  // ideal here, but the schema-level FKs make ordering safe across
  // separate inserts: configs → slots → schedule.
  const [insertedConfig] = await dbHttp
    .insert(bagsFeeShareConfigs)
    .values({
      projectId: input.projectId,
      baseMint: input.baseMint,
      quoteMint: WSOL_MINT.toBase58(),
      feeShareConfigPda: feeShareConfigPda.toBase58(),
      feeShareAuthorityPda: feeShareAuthorityPda.toBase58(),
      adminPubkey: input.adminPubkey,
      managerPubkey: null, // populated by confirmManagerDelegation
      claimerCount: input.claimers.length,
      isInitFinalized: true, // Bags' SDK auto-finalizes at launch
      isUpdateLocked: false,
      isUpdateFinalized: false,
    })
    .returning({ id: bagsFeeShareConfigs.id });
  if (!insertedConfig) {
    throw new Error(
      "mirrorLaunchToV11Tables: failed to insert bags_fee_share_configs row",
    );
  }
  const feeShareConfigId = insertedConfig.id;

  await dbHttp.insert(bagsClaimerSlots).values(
    input.claimers.map((c) => ({
      feeShareConfigId,
      slotIndex: c.slotIndex,
      claimerPubkey: c.claimerPubkey,
      provider: c.provider,
      socialHandle: c.socialHandle,
      contributorId: c.contributorId,
      initialBps: c.initialBps,
      currentBps: c.initialBps,
    })),
  );

  const now = new Date();
  const nextRunAt = new Date(
    now.getTime() + RAMP_UP_FIRST_RUN_HOURS * 3600 * 1000,
  );
  const [insertedSchedule] = await dbHttp
    .insert(payoutSchedules)
    .values({
      projectId: input.projectId,
      steadyStateCadenceHours: input.steadyStateCadenceHours,
      status: "pending_first_run",
      nextRunAt,
    })
    .returning({ id: payoutSchedules.id });
  if (!insertedSchedule) {
    throw new Error(
      "mirrorLaunchToV11Tables: failed to insert payout_schedules row",
    );
  }

  await audit({
    actorUserId: null,
    action: "project.launch_complete",
    targetType: "project",
    targetId: input.projectId,
    metadata: {
      v11_mirror: true,
      feeShareConfigId,
      feeShareConfigPda: feeShareConfigPda.toBase58(),
      claimerCount: input.claimers.length,
      steadyStateCadenceHours: input.steadyStateCadenceHours,
      nextRunAtISO: nextRunAt.toISOString(),
    },
  });

  return {
    feeShareConfigId,
    payoutScheduleId: insertedSchedule.id,
    feeShareConfigPda: feeShareConfigPda.toBase58(),
    alreadyMirrored: false,
  };
}

function validateMirrorInput(input: MirrorLaunchInput): void {
  if (input.claimers.length === 0 || input.claimers.length > 100) {
    throw new Error(
      `claimers.length must be 1..100; got ${input.claimers.length}`,
    );
  }
  let bpsSum = 0;
  const seenSlots = new Set<number>();
  const seenPubkeys = new Set<string>();
  for (const c of input.claimers) {
    bpsSum += c.initialBps;
    if (!Number.isInteger(c.initialBps) || c.initialBps < 0 || c.initialBps > 10_000) {
      throw new Error(`initialBps must be in [0, 10000]; got ${c.initialBps}`);
    }
    if (!Number.isInteger(c.slotIndex) || c.slotIndex < 0) {
      throw new Error(`slotIndex must be a non-negative integer`);
    }
    if (seenSlots.has(c.slotIndex)) {
      throw new Error(`duplicate slotIndex ${c.slotIndex}`);
    }
    seenSlots.add(c.slotIndex);
    if (seenPubkeys.has(c.claimerPubkey)) {
      throw new Error(`duplicate claimer pubkey ${c.claimerPubkey}`);
    }
    seenPubkeys.add(c.claimerPubkey);
  }
  if (bpsSum !== 10_000) {
    throw new Error(`sum of initialBps must be 10000; got ${bpsSum}`);
  }
  // Slot indices must be dense [0..N-1] for the on-chain claimers array
  // to align with the bps array used by manager_update_fee_config.
  for (let i = 0; i < input.claimers.length; i++) {
    if (!seenSlots.has(i)) {
      throw new Error(
        `slotIndex must be dense [0..${input.claimers.length - 1}]; missing ${i}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------

export interface PreparedManagerDelegation {
  /** Base64-encoded v0 tx for the project owner to sign. */
  transactionBase64: string;
  /** The manager pubkey we'll set on-chain (= managerSigner().publicKey). */
  managerPubkey: string;
  feeShareConfigId: string;
}

/**
 * Build an unsigned `update_fee_config_manager` v0 transaction for the
 * project owner (admin) to sign in their browser wallet.
 *
 * Reads the fee-share-config from `bags_fee_share_configs`, derives the
 * setManager instruction via `program-client`, fetches a recent blockhash,
 * and serializes a partially-signed v0 tx with the admin as fee payer.
 * The browser wallet signs and broadcasts.
 *
 * Throws if:
 *  - hasCredentials.solana() / hasCredentials.managerKey() are false
 *    (we cannot offer a manager pubkey to set)
 *  - The project doesn't have a v1.1 mirror row (mirror first)
 *  - The mirror row already has a manager_pubkey (already delegated)
 */
export async function prepareManagerDelegationTransaction(
  projectId: string,
): Promise<PreparedManagerDelegation> {
  if (!hasCredentials.managerKey()) {
    throw new Error(
      "SOLANA_MANAGER_KEYPAIR is not configured; cannot offer a manager pubkey.",
    );
  }
  const env = serverEnv();
  if (!env.HELIUS_RPC_URL) {
    throw new Error("HELIUS_RPC_URL is required to prepare a delegation tx.");
  }
  const [config] = await dbHttp
    .select()
    .from(bagsFeeShareConfigs)
    .where(eq(bagsFeeShareConfigs.projectId, projectId))
    .limit(1);
  if (!config) {
    throw new Error(
      `no bags_fee_share_configs row for project ${projectId}; mirror first`,
    );
  }
  if (config.managerPubkey) {
    throw new Error(
      `manager already delegated to ${config.managerPubkey} for project ${projectId}`,
    );
  }

  const connection = new Connection(env.HELIUS_RPC_URL, "confirmed");
  const newManagerPk = managerSigner().publicKey;
  const adminPk = new PublicKey(config.adminPubkey);
  const baseMintPk = new PublicKey(config.baseMint);
  const quoteMintPk = new PublicKey(config.quoteMint);

  const ix = await buildSetManagerIx({
    connection,
    admin: adminPk,
    payer: adminPk,
    newManager: newManagerPk,
    baseMint: baseMintPk,
    quoteMint: quoteMintPk,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: adminPk,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  // No partial sign — the project owner signs in-browser.

  return {
    transactionBase64: Buffer.from(tx.serialize()).toString("base64"),
    managerPubkey: newManagerPk.toBase58(),
    feeShareConfigId: config.id,
  };
}

// ---------------------------------------------------------------------------

export interface ConfirmManagerDelegationInput {
  projectId: string;
  txSignature: string;
}

/**
 * After the project owner broadcasts the signed delegation tx, confirm it
 * on-chain and update the v1.1 mirror.
 *
 * Verification: confirms the tx is finalized AND the on-chain config's
 * manager field now matches our managerSigner().publicKey (read via the
 * on-chain `FeeShareConfig` account's `manager` field). Refuses to record
 * a delegation if either fails — defends against the project owner
 * submitting a tx that delegates to someone else.
 */
export async function confirmManagerDelegation(
  input: ConfirmManagerDelegationInput,
): Promise<{ managerPubkey: string }> {
  if (!hasCredentials.managerKey()) {
    throw new Error(
      "SOLANA_MANAGER_KEYPAIR is not configured; cannot confirm delegation.",
    );
  }
  const env = serverEnv();
  if (!env.HELIUS_RPC_URL) {
    throw new Error("HELIUS_RPC_URL is required to confirm a delegation tx.");
  }
  const [config] = await dbHttp
    .select()
    .from(bagsFeeShareConfigs)
    .where(eq(bagsFeeShareConfigs.projectId, input.projectId))
    .limit(1);
  if (!config) {
    throw new Error(
      `no bags_fee_share_configs row for project ${input.projectId}`,
    );
  }
  if (config.managerPubkey) {
    return { managerPubkey: config.managerPubkey };
  }

  const connection = new Connection(env.HELIUS_RPC_URL, "confirmed");
  const expectedManager = managerSigner().publicKey;

  // Wait for finalization. confirmTransaction with the signature blocks
  // until the network confirms it (or times out).
  const confirmResult = await connection.confirmTransaction(
    input.txSignature,
    "confirmed",
  );
  if (confirmResult.value.err) {
    throw new Error(
      `tx ${input.txSignature} failed: ${JSON.stringify(confirmResult.value.err)}`,
    );
  }

  // Read the on-chain FeeShareConfig and verify the manager field
  // matches what we expect. Layout per IDL FeeShareConfigHeader:
  //   8 disc + 32 base_mint + 32 quote_mint + 32 partner + 32 partner_config
  //   + 32 manager + ...
  // → manager pubkey starts at offset 8+32+32+32+32 = 136.
  const accountInfo = await connection.getAccountInfo(
    new PublicKey(config.feeShareConfigPda),
    { commitment: "confirmed" },
  );
  if (!accountInfo) {
    throw new Error(
      `fee_share_config account ${config.feeShareConfigPda} not found on-chain`,
    );
  }
  const onChainManager = new PublicKey(
    accountInfo.data.subarray(136, 136 + 32),
  );
  if (!onChainManager.equals(expectedManager)) {
    throw new Error(
      `on-chain manager ${onChainManager.toBase58()} does not match our manager keypair ${expectedManager.toBase58()} — delegation tx may have set a different pubkey`,
    );
  }

  await dbHttp
    .update(bagsFeeShareConfigs)
    .set({
      managerPubkey: expectedManager.toBase58(),
      managerDelegatedAt: new Date(),
      managerDelegationTxSignature: input.txSignature,
      updatedAt: new Date(),
    })
    .where(eq(bagsFeeShareConfigs.id, config.id));

  await audit({
    actorUserId: null,
    action: "bags.manager_delegated",
    targetType: "bags_fee_share_config",
    targetId: config.id,
    metadata: {
      projectId: input.projectId,
      managerPubkey: expectedManager.toBase58(),
      txSignature: input.txSignature,
    },
  });

  return { managerPubkey: expectedManager.toBase58() };
}

