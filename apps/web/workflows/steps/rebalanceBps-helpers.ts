/**
 * Step helpers for the BPS rebalance workflow.
 *
 * Architecture: cadence cron picks up payout_schedules whose next_run_at
 * is due → per-schedule child workflow loads (config, slots, latest
 * snapshot), computes the new BPS, persists an attempt row keyed by
 * plan_hash for idempotency, builds + signs + broadcasts the
 * `manager_update_fee_config` ix via `lib/bags/program-client`, then
 * finalizes the slots' current_bps + the schedule's next_run_at + an
 * audit entry.
 *
 * Stub mode (no BAGS / HELIUS / SOLANA_MANAGER_KEYPAIR creds) skips the
 * on-chain step but still updates the DB so the dev path is observable.
 */

import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { and, eq, isNull, lte } from "drizzle-orm";
import { dbHttp } from "@/db";
import {
  bagsClaimerSlots,
  bagsFeeShareConfigs,
  bagsRebalanceAttempts,
  payoutSchedules,
  snapshots,
} from "@/db/schema";
import {
  hasCredentials,
  serverEnv,
  stubsAllowed,
} from "@/lib/env";
import { audit } from "@/lib/audit";
import {
  acquireWorkflowLock,
  type WorkflowLock,
} from "@/lib/workflow-locks";
import { managerSigner } from "@/lib/solana/manager-signer";
import { buildManagerUpdateFeeConfigIx } from "@/lib/bags/program-client";
import {
  allocateBpsByScore,
  hashRebalancePlan,
  type BpsAllocationResult,
  type ClaimerSlotInput,
} from "@/lib/payouts/bps-plan";

const RAMP_UP_SECOND_RUN_HOURS = 72; // 3 days after run #1.

export type { WorkflowLock };

// ---- Stub-mode + lock plumbing ------------------------------------------

export async function rebalanceAcquireLockStep(
  scope: string,
  ttlSeconds = 20 * 60,
): Promise<WorkflowLock> {
  "use step";
  return await acquireWorkflowLock("rebalanceBps", scope, ttlSeconds);
}

export async function rebalanceReleaseLockStep(lock: WorkflowLock): Promise<void> {
  "use step";
  if (!lock.acquired) return;
  const { releaseWorkflowLock } = await import("@/lib/workflow-locks");
  await releaseWorkflowLock(lock);
}

export async function rebalanceStubModeStep(): Promise<boolean> {
  "use step";
  const env = serverEnv();
  const live =
    hasCredentials.bags() &&
    Boolean(env.HELIUS_RPC_URL) &&
    hasCredentials.managerKey();
  if (!live && !stubsAllowed()) {
    throw new Error(
      "Live Bags + Helius + manager keypair credentials are required to rebalance BPS in production.",
    );
  }
  return !live;
}

// ---- Schedule selection -------------------------------------------------

export interface DueScheduleRowJson {
  scheduleId: string;
  projectId: string;
  feeShareConfigId: string;
  totalRebalances: number;
}

/**
 * Load all payout_schedules whose next_run_at <= now, not paused or
 * archived, and join their fee-share-config id. Returns at most `limit`
 * rows so a single cron tick has bounded work.
 */
export async function loadDueSchedulesStep(
  limit = 20,
): Promise<DueScheduleRowJson[]> {
  "use step";
  const now = new Date();
  const rows = await dbHttp
    .select({
      scheduleId: payoutSchedules.id,
      projectId: payoutSchedules.projectId,
      configId: bagsFeeShareConfigs.id,
      totalRebalances: payoutSchedules.totalRebalances,
    })
    .from(payoutSchedules)
    .innerJoin(
      bagsFeeShareConfigs,
      eq(bagsFeeShareConfigs.projectId, payoutSchedules.projectId),
    )
    .where(
      and(
        lte(payoutSchedules.nextRunAt, now),
        isNull(payoutSchedules.pausedAt),
        isNull(payoutSchedules.archivedAt),
      ),
    )
    .limit(limit);
  return rows.map((r) => ({
    scheduleId: r.scheduleId,
    projectId: r.projectId,
    feeShareConfigId: r.configId,
    totalRebalances: r.totalRebalances,
  }));
}

// ---- Per-schedule context load ------------------------------------------

export interface RebalanceContextJson {
  scheduleId: string;
  projectId: string;
  feeShareConfigId: string;
  baseMint: string;
  quoteMint: string;
  managerPubkey: string | null;
  isUpdateLocked: boolean;
  isUpdateFinalized: boolean;
  totalRebalances: number;
  steadyStateCadenceHours: number;
  slots: ClaimerSlotInput[];
  snapshotId: string | null;
  snapshotPeriod: string | null;
  /** From the latest frozen snapshot's leaderboard, score-bearing rows only. */
  scoreInputs: Array<{
    contributorId: string;
    ghUsername: string;
    score: number;
  }>;
}

export async function loadRebalanceContextStep(
  scheduleId: string,
): Promise<RebalanceContextJson | null> {
  "use step";
  const [schedule] = await dbHttp
    .select()
    .from(payoutSchedules)
    .where(eq(payoutSchedules.id, scheduleId))
    .limit(1);
  if (!schedule) return null;

  const [config] = await dbHttp
    .select()
    .from(bagsFeeShareConfigs)
    .where(eq(bagsFeeShareConfigs.projectId, schedule.projectId))
    .limit(1);
  if (!config) return null;

  if (config.isUpdateFinalized) return null;
  if (config.isUpdateLocked) return null;

  const slotRows = await dbHttp
    .select()
    .from(bagsClaimerSlots)
    .where(eq(bagsClaimerSlots.feeShareConfigId, config.id));
  const slots = slotRows
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map<ClaimerSlotInput>((row) => ({
      slotIndex: row.slotIndex,
      githubLogin:
        row.provider === "github" ? row.socialHandle?.toLowerCase() ?? null : null,
      contributorId: row.contributorId,
      currentBps: row.currentBps,
    }));

  const [latestSnapshot] = await dbHttp
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.projectId, schedule.projectId),
        eq(snapshots.status, "frozen"),
      ),
    )
    .orderBy(snapshots.takenAt)
    .limit(1);

  const scoreInputs =
    latestSnapshot?.leaderboard
      ?.filter((entry) => entry.score > 0)
      .map((entry) => ({
        contributorId: entry.contributorId,
        ghUsername: entry.ghUsername,
        score: entry.score,
      })) ?? [];

  return {
    scheduleId: schedule.id,
    projectId: schedule.projectId,
    feeShareConfigId: config.id,
    baseMint: config.baseMint,
    quoteMint: config.quoteMint,
    managerPubkey: config.managerPubkey,
    isUpdateLocked: config.isUpdateLocked,
    isUpdateFinalized: config.isUpdateFinalized,
    totalRebalances: schedule.totalRebalances,
    steadyStateCadenceHours: schedule.steadyStateCadenceHours,
    slots,
    snapshotId: latestSnapshot?.id ?? null,
    snapshotPeriod: latestSnapshot?.snapshotPeriod ?? null,
    scoreInputs,
  };
}

// ---- Plan computation ----------------------------------------------------

export interface RebalancePlanJson {
  bps: number[];
  fromIdx: number;
  toIdx: number;
  finalizeUpdate: boolean;
  planHash: string;
  preservedPrevious: boolean;
  matchedSlots: number;
}

export async function computeRebalancePlanStep(
  ctx: RebalanceContextJson,
): Promise<RebalancePlanJson | null> {
  "use step";
  if (ctx.slots.length === 0) return null;
  const allocation: BpsAllocationResult = allocateBpsByScore(
    ctx.slots,
    ctx.scoreInputs,
  );
  const fromIdx = 0;
  const toIdx = ctx.slots.length - 1;
  const planHash = hashRebalancePlan({
    feeShareConfigId: ctx.feeShareConfigId,
    bps: allocation.bps,
    fromIdx,
    toIdx,
    finalizeUpdate: false,
  });
  return {
    bps: allocation.bps,
    fromIdx,
    toIdx,
    finalizeUpdate: false,
    planHash,
    preservedPrevious: allocation.preservedPrevious,
    matchedSlots: allocation.matchedSlots,
  };
}

// ---- Attempt reservation (idempotency) ----------------------------------

export interface ReservedAttemptJson {
  attemptId: string;
  alreadyConfirmed: boolean;
  alreadyConfirmedSignature: string | null;
}

export async function reserveAttemptStep(
  ctx: RebalanceContextJson,
  plan: RebalancePlanJson,
): Promise<ReservedAttemptJson> {
  "use step";
  // If a confirmed attempt already exists for this exact plan, skip the
  // on-chain write entirely (idempotency-on-success).
  const [existing] = await dbHttp
    .select()
    .from(bagsRebalanceAttempts)
    .where(
      and(
        eq(bagsRebalanceAttempts.feeShareConfigId, ctx.feeShareConfigId),
        eq(bagsRebalanceAttempts.planHash, plan.planHash),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.status === "confirmed") {
      return {
        attemptId: existing.id,
        alreadyConfirmed: true,
        alreadyConfirmedSignature: existing.signatures[0] ?? null,
      };
    }
    // Existing failed/pending row — bump the attempt counter and reuse.
    await dbHttp
      .update(bagsRebalanceAttempts)
      .set({
        status: "pending",
        attemptCount: existing.attemptCount + 1,
        startedAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(bagsRebalanceAttempts.id, existing.id));
    return {
      attemptId: existing.id,
      alreadyConfirmed: false,
      alreadyConfirmedSignature: null,
    };
  }
  const [inserted] = await dbHttp
    .insert(bagsRebalanceAttempts)
    .values({
      feeShareConfigId: ctx.feeShareConfigId,
      snapshotId: ctx.snapshotId,
      snapshotPeriod: ctx.snapshotPeriod ?? "no-snapshot",
      planHash: plan.planHash,
      plan: {
        bps: plan.bps,
        fromIdx: plan.fromIdx,
        toIdx: plan.toIdx,
        finalizeUpdate: plan.finalizeUpdate,
        requiresLookupTables: false,
      },
      status: "pending",
      attemptCount: 1,
      startedAt: new Date(),
    })
    .returning({ id: bagsRebalanceAttempts.id });
  return {
    attemptId: inserted!.id,
    alreadyConfirmed: false,
    alreadyConfirmedSignature: null,
  };
}

// ---- On-chain execution -------------------------------------------------

export interface BroadcastResultJson {
  status: "confirmed" | "failed" | "stub";
  signature: string | null;
  error: string | null;
}

export async function buildSignAndBroadcastStep(
  ctx: RebalanceContextJson,
  plan: RebalancePlanJson,
  attemptId: string,
  stub: boolean,
): Promise<BroadcastResultJson> {
  "use step";
  if (stub) {
    return { status: "stub", signature: null, error: null };
  }
  const env = serverEnv();
  if (!env.HELIUS_RPC_URL) {
    return {
      status: "failed",
      signature: null,
      error: "HELIUS_RPC_URL missing",
    };
  }
  if (!ctx.managerPubkey) {
    return {
      status: "failed",
      signature: null,
      error: "manager not delegated for this config",
    };
  }
  const signer = managerSigner();
  if (signer.publicKey.toBase58() !== ctx.managerPubkey) {
    return {
      status: "failed",
      signature: null,
      error: `manager keypair ${signer.publicKey.toBase58()} does not match on-chain manager ${ctx.managerPubkey}`,
    };
  }
  const connection = new Connection(env.HELIUS_RPC_URL, "confirmed");

  let ix: TransactionInstruction;
  try {
    ix = await buildManagerUpdateFeeConfigIx({
      connection,
      manager: signer.publicKey,
      payer: signer.publicKey,
      baseMint: new PublicKey(ctx.baseMint),
      quoteMint: new PublicKey(ctx.quoteMint),
      bps: plan.bps.slice(plan.fromIdx, plan.toIdx + 1),
      fromIdx: plan.fromIdx,
      toIdx: plan.toIdx,
      finalizeUpdate: plan.finalizeUpdate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markAttemptFailed(attemptId, `build:${message}`);
    return { status: "failed", signature: null, error: message };
  }

  await dbHttp
    .update(bagsRebalanceAttempts)
    .set({ status: "signing", updatedAt: new Date() })
    .where(eq(bagsRebalanceAttempts.id, attemptId));

  let signature: string;
  try {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    tx.sign([signer]);
    signature = await connection.sendTransaction(tx, {
      maxRetries: 3,
      skipPreflight: false,
    });
    await dbHttp
      .update(bagsRebalanceAttempts)
      .set({
        status: "broadcasting",
        signatures: [signature],
        updatedAt: new Date(),
      })
      .where(eq(bagsRebalanceAttempts.id, attemptId));
    await connection.confirmTransaction(signature, "confirmed");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markAttemptFailed(attemptId, `sendconfirm:${message}`);
    return { status: "failed", signature: null, error: message };
  }

  await dbHttp
    .update(bagsRebalanceAttempts)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
      finalizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bagsRebalanceAttempts.id, attemptId));
  return { status: "confirmed", signature, error: null };
}

async function markAttemptFailed(
  attemptId: string,
  errorMessage: string,
): Promise<void> {
  await dbHttp
    .update(bagsRebalanceAttempts)
    .set({
      status: "failed",
      error: errorMessage.slice(0, 500),
      finalizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bagsRebalanceAttempts.id, attemptId));
}

// ---- Finalize ------------------------------------------------------------

export async function finalizeSuccessStep(args: {
  ctx: RebalanceContextJson;
  plan: RebalancePlanJson;
  attemptId: string;
  signature: string | null;
  stub: boolean;
}): Promise<{ nextRunAt: string }> {
  "use step";
  const now = new Date();

  // Update each slot's current_bps to match the new plan.
  for (let i = 0; i < args.plan.bps.length; i++) {
    const slotIndex = args.plan.fromIdx + i;
    const newBps = args.plan.bps[i]!;
    await dbHttp
      .update(bagsClaimerSlots)
      .set({ currentBps: newBps, lastBpsUpdateAt: now })
      .where(
        and(
          eq(bagsClaimerSlots.feeShareConfigId, args.ctx.feeShareConfigId),
          eq(bagsClaimerSlots.slotIndex, slotIndex),
        ),
      );
  }

  // Compute the next run timestamp using the ramp-up sequence:
  //   total=0 (just ran the first) → +72h
  //   total>=1 → +steadyStateCadenceHours
  const newTotal = args.ctx.totalRebalances + 1;
  const intervalHours =
    args.ctx.totalRebalances === 0
      ? RAMP_UP_SECOND_RUN_HOURS
      : args.ctx.steadyStateCadenceHours;
  const nextRunAt = new Date(now.getTime() + intervalHours * 3600 * 1000);

  await dbHttp
    .update(payoutSchedules)
    .set({
      lastRunAt: now,
      nextRunAt,
      lastRunTxSignature: args.signature,
      totalRebalances: newTotal,
      status: "active",
      updatedAt: now,
    })
    .where(eq(payoutSchedules.id, args.ctx.scheduleId));

  await audit({
    actorUserId: null,
    action: "bags.rebalance_succeeded",
    targetType: "bags_fee_share_config",
    targetId: args.ctx.feeShareConfigId,
    metadata: {
      attemptId: args.attemptId,
      planHash: args.plan.planHash,
      txSignature: args.signature,
      stub: args.stub,
      preservedPrevious: args.plan.preservedPrevious,
      matchedSlots: args.plan.matchedSlots,
      newBps: args.plan.bps,
      snapshotPeriod: args.ctx.snapshotPeriod,
      totalRebalancesAfter: newTotal,
    },
  });

  return { nextRunAt: nextRunAt.toISOString() };
}

export async function finalizeFailureStep(args: {
  ctx: RebalanceContextJson;
  plan: RebalancePlanJson | null;
  attemptId: string | null;
  error: string;
}): Promise<{ nextRunAt: string }> {
  "use step";
  // Failed attempt: reschedule with backoff (1 hour) instead of advancing
  // through the ramp-up sequence. The attempt row stays in 'failed' state
  // for the next cron tick to retry via the plan_hash idempotency path.
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + 60 * 60 * 1000);
  await dbHttp
    .update(payoutSchedules)
    .set({ nextRunAt, updatedAt: now })
    .where(eq(payoutSchedules.id, args.ctx.scheduleId));

  await audit({
    actorUserId: null,
    action: "bags.rebalance_failed",
    targetType: "bags_fee_share_config",
    targetId: args.ctx.feeShareConfigId,
    metadata: {
      attemptId: args.attemptId,
      planHash: args.plan?.planHash ?? null,
      error: args.error.slice(0, 500),
      snapshotPeriod: args.ctx.snapshotPeriod,
    },
  });

  return { nextRunAt: nextRunAt.toISOString() };
}

// ---- Workflow fan-out trigger -------------------------------------------

export async function startProcessScheduleStep(scheduleId: string): Promise<void> {
  "use step";
  const { processScheduleRebalance } = await import(
    "@/workflows/rebalanceBps"
  );
  await processScheduleRebalance(scheduleId);
}
