/**
 * BPS rebalance workflow.
 *
 * Driven by the cadence cron (`/api/cron/rebalance-bps`). For each project
 * whose payout schedule is due, builds a new BPS plan from the latest
 * snapshot, signs `manager_update_fee_config` with the GitShipt manager
 * keypair, broadcasts it, and updates per-slot weights + the schedule's
 * next_run_at.
 *
 * No SOL is custodied or dispatched. Contributors claim from Bags
 * directly through the GitHub-OAuth UI.
 */

import {
  buildSignAndBroadcastStep,
  computeRebalancePlanStep,
  finalizeFailureStep,
  finalizeSuccessStep,
  loadDueSchedulesStep,
  loadRebalanceContextStep,
  rebalanceAcquireLockStep,
  rebalanceReleaseLockStep,
  rebalanceStubModeStep,
  reserveAttemptStep,
  startProcessScheduleStep,
} from "@/workflows/steps/rebalanceBps-helpers";

/**
 * Root workflow — fan-out per due schedule. Cron picks up every 15 min
 * (see vercel.json); each tick scans for ready schedules and dispatches
 * a child workflow per. A single Redis-backed lock prevents two crons
 * from racing on the same root.
 */
export async function rebalanceBps(): Promise<{ count: number }> {
  "use workflow";
  const lock = await rebalanceAcquireLockStep("root", 20 * 60);
  if (!lock.acquired) return { count: 0 };
  try {
    const due = await loadDueSchedulesStep();
    for (const row of due) {
      await startProcessScheduleStep(row.scheduleId);
    }
    return { count: due.length };
  } finally {
    await rebalanceReleaseLockStep(lock);
  }
}

/**
 * Per-schedule pipeline:
 *   1. Single-flight lock on this schedule (no two crons can run the
 *      same project's rebalance simultaneously).
 *   2. Load (schedule + on-chain config + slots + latest snapshot).
 *   3. Compute the new BPS plan.
 *   4. Reserve a `bags_rebalance_attempts` row keyed by plan_hash. If an
 *      already-confirmed attempt exists for this exact plan, skip with
 *      "noop_already_confirmed" — the on-chain state already matches.
 *   5. Build + sign + broadcast `manager_update_fee_config` (in stub
 *      mode this is a no-op that still updates the DB so dev paths
 *      remain observable).
 *   6. Finalize: update each slot's current_bps, advance the schedule's
 *      next_run_at per the ramp-up sequence (24h → 3d → steady state),
 *      write an audit row.
 */
export async function processScheduleRebalance(scheduleId: string): Promise<{
  scheduleId: string;
  status:
    | "completed"
    | "skipped_locked"
    | "skipped_no_context"
    | "skipped_no_slots"
    | "skipped_idempotent"
    | "stubbed"
    | "failed";
  signature: string | null;
  nextRunAt: string | null;
  error: string | null;
}> {
  "use workflow";
  const lock = await rebalanceAcquireLockStep(`schedule:${scheduleId}`, 30 * 60);
  if (!lock.acquired) {
    return {
      scheduleId,
      status: "skipped_locked",
      signature: null,
      nextRunAt: null,
      error: null,
    };
  }
  try {
    const ctx = await loadRebalanceContextStep(scheduleId);
    if (!ctx) {
      return {
        scheduleId,
        status: "skipped_no_context",
        signature: null,
        nextRunAt: null,
        error: null,
      };
    }

    const plan = await computeRebalancePlanStep(ctx);
    if (!plan) {
      return {
        scheduleId,
        status: "skipped_no_slots",
        signature: null,
        nextRunAt: null,
        error: null,
      };
    }

    const reservation = await reserveAttemptStep(ctx, plan);
    if (reservation.alreadyConfirmed) {
      // Plan already on-chain. Still advance the schedule so the cron
      // moves on to the next cycle without re-trying.
      const result = await finalizeSuccessStep({
        ctx,
        plan,
        attemptId: reservation.attemptId,
        signature: reservation.alreadyConfirmedSignature,
        stub: false,
      });
      return {
        scheduleId,
        status: "skipped_idempotent",
        signature: reservation.alreadyConfirmedSignature,
        nextRunAt: result.nextRunAt,
        error: null,
      };
    }

    const stub = await rebalanceStubModeStep();
    const broadcast = await buildSignAndBroadcastStep(
      ctx,
      plan,
      reservation.attemptId,
      stub,
    );
    if (broadcast.status === "failed") {
      const result = await finalizeFailureStep({
        ctx,
        plan,
        attemptId: reservation.attemptId,
        error: broadcast.error ?? "unknown",
      });
      return {
        scheduleId,
        status: "failed",
        signature: null,
        nextRunAt: result.nextRunAt,
        error: broadcast.error,
      };
    }

    const result = await finalizeSuccessStep({
      ctx,
      plan,
      attemptId: reservation.attemptId,
      signature: broadcast.signature,
      stub: broadcast.status === "stub",
    });
    return {
      scheduleId,
      status: broadcast.status === "stub" ? "stubbed" : "completed",
      signature: broadcast.signature,
      nextRunAt: result.nextRunAt,
      error: null,
    };
  } finally {
    await rebalanceReleaseLockStep(lock);
  }
}
