/**
 * Step helpers for `reconcileFunds`. Reads the hot wallet balance and
 * relevant DB counters, computes the issue summary, persists a
 * fund_reconciliation_runs row, and audits when critical.
 */

import { PublicKey } from "@solana/web3.js";
import { sql } from "drizzle-orm";
import { dbHttp } from "@/db";
import { fundReconciliationRuns, partnerFeeClaimAttempts } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  acquireWorkflowLock,
  releaseWorkflowLock,
  type WorkflowLock,
} from "@/lib/workflow-locks";
import { summarizeFundIssues } from "@/lib/funds/accounting";
import { solanaConnection, withRpcRetry } from "@/lib/solana/connection";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { hasCredentials } from "@/lib/env";

export async function acquireReconcileLockStep(): Promise<WorkflowLock> {
  "use step";
  return acquireWorkflowLock("reconcileFunds", "root", 10 * 60);
}

export async function releaseReconcileLockStep(
  lock: WorkflowLock,
): Promise<void> {
  "use step";
  if (!lock.acquired) return;
  await releaseWorkflowLock(lock);
}

export async function runReconciliationStep(): Promise<{
  status: "clean" | "warning" | "critical";
  runId: string;
  issueCount: number;
}> {
  "use step";
  const hotWalletAddress = payoutSignerPublicKey();
  let hotWalletBalanceLamports = 0n;
  if (hotWalletAddress && hasCredentials.solana()) {
    try {
      const conn = solanaConnection("confirmed");
      const lamports = await withRpcRetry(() =>
        conn.getBalance(new PublicKey(hotWalletAddress), "confirmed"),
      );
      hotWalletBalanceLamports = BigInt(lamports);
    } catch {
      // Leave balance at 0; summarizeFundIssues will surface as a
      // hot_wallet_unavailable warning via hotWalletAddress=null below.
    }
  }

  // Bags-native: contributor SOL is custodied by Bags. GitShipt-side
  // liabilities are partner-fee receipts in flight. Count claim attempts
  // that haven't settled and ones flagged for manual review.
  const [pendingAgg] = await dbHttp
    .select({
      count: sql<number>`count(*) filter (where status in ('pending','sending'))::int`,
      stale: sql<number>`count(*) filter (where status = 'review')::int`,
    })
    .from(partnerFeeClaimAttempts);

  const summary = summarizeFundIssues({
    hotWalletAddress,
    hotWalletBalanceLamports,
    escrowLiabilityLamports: 0n, // No GitShipt-side escrow in v1.
    unsettledRecipientLamports: 0n, // Bags custodies recipient SOL.
    manualReviewCount: pendingAgg?.count ?? 0,
    staleSignatureCount: pendingAgg?.stale ?? 0,
    activeSplEscrowCount: 0, // SOL-only invariant.
    killSwitchEnabled: false,
  });

  const [inserted] = await dbHttp
    .insert(fundReconciliationRuns)
    .values({
      status: summary.status,
      hotWalletAddress: hotWalletAddress ?? null,
      hotWalletBalanceLamports,
      escrowLiabilityLamports: 0n,
      unsettledRecipientLamports: 0n,
      manualReviewCount: pendingAgg?.count ?? 0,
      staleSignatureCount: pendingAgg?.stale ?? 0,
      issues: summary.issues,
    })
    .returning({ id: fundReconciliationRuns.id });
  const runId = inserted!.id;

  if (summary.status !== "clean") {
    await audit({
      actorUserId: null,
      action:
        summary.status === "critical"
          ? "fund.reconciliation_critical"
          : "fund.reconciliation_warning",
      targetType: "fund_reconciliation_run",
      targetId: runId,
      metadata: {
        issueCount: summary.issues.length,
        issueCodes: summary.issues.map((i) => i.code),
      },
    });
  }

  return {
    status: summary.status,
    runId,
    issueCount: summary.issues.length,
  };
}
