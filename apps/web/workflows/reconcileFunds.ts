/**
 * Periodic fund reconciliation.
 *
 * Snapshots the operator-visible money state into `fund_reconciliation_runs`
 * so drift between Bags-claimed amounts and dispatched payouts is
 * detectable. Read-only — does not mutate any money-moving state.
 *
 * The architecture is Bags-native: contributors claim SOL directly from
 * Bags vaults, so the GitShipt-side liabilities are limited to partner-fee
 * receipts vs. dispatched, plus any not-yet-implemented escrow surface.
 */

import {
  acquireReconcileLockStep,
  releaseReconcileLockStep,
  runReconciliationStep,
} from "@/workflows/steps/reconcileFunds-helpers";

export async function reconcileFunds(): Promise<{
  status: "clean" | "warning" | "critical" | "skipped_locked";
  runId: string | null;
  issueCount: number;
}> {
  "use workflow";
  const lock = await acquireReconcileLockStep();
  if (!lock.acquired) {
    return { status: "skipped_locked", runId: null, issueCount: 0 };
  }
  try {
    return await runReconciliationStep();
  } finally {
    await releaseReconcileLockStep(lock);
  }
}
