import { dbHttp, dbPool } from "@/db";
import { partnerFeeClaimAttempts } from "@/db/schema";
import type { PartnerClaimStatsJson } from "@/db/schema/fund-reconciliation";
import { bags } from "@/lib/bags/client";
import { applyDbRlsContext, enterDbWorkflowContext } from "@/lib/db-rls";
import { derivePartnerClaimDeltas } from "@/lib/funds/accounting";
import { isKillSwitchEnabled } from "@/lib/kill-switch";
import { solanaConnection } from "@/lib/solana/connection";
import { and, eq, inArray, sql } from "drizzle-orm";

const MANUAL_RECONCILIATION_ERROR =
  "manual_reconciliation_required_external_side_effect_may_have_succeeded";

export interface PartnerFeeClaimResult {
  attemptId: string;
  status: "succeeded" | "failed" | "review" | "skipped";
  partnerWallet: string;
  signatures: string[];
  before: PartnerClaimStatsJson | null;
  after: PartnerClaimStatsJson | null;
  claimedDeltaLamports: string;
  unclaimedDeltaLamports: string;
  reason?: string;
}

export async function reservePartnerFeeClaimAttempt(args: {
  partnerWallet: string;
  partnerConfigKey: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  enterDbWorkflowContext("partner-fee-claims:reserve");
  return await dbPool().transaction(async (tx) => {
    await applyDbRlsContext(tx, {
      mode: "service",
      reason: "partner-fee-claims:reserve",
    });
    const [inserted] = await tx
      .insert(partnerFeeClaimAttempts)
      .values({
        partnerWallet: args.partnerWallet,
        partnerConfigKey: args.partnerConfigKey,
        idempotencyKey: args.idempotencyKey,
        status: "pending",
      })
      .onConflictDoNothing({ target: partnerFeeClaimAttempts.idempotencyKey })
      .returning({
        id: partnerFeeClaimAttempts.id,
        status: partnerFeeClaimAttempts.status,
      });
    if (inserted) return inserted;

    const [existing] = await tx
      .select({
        id: partnerFeeClaimAttempts.id,
        status: partnerFeeClaimAttempts.status,
      })
      .from(partnerFeeClaimAttempts)
      .where(eq(partnerFeeClaimAttempts.idempotencyKey, args.idempotencyKey))
      .limit(1);
    if (!existing) throw new Error("partner_fee_claim_attempt_missing");
    return existing;
  });
}

export async function executePartnerFeeClaimAttempt(
  attemptId: string,
): Promise<PartnerFeeClaimResult> {
  enterDbWorkflowContext("partner-fee-claims:execute");
  if (await isKillSwitchEnabled()) {
    return await markAttemptFailed(attemptId, "kill_switch_enabled");
  }

  const [claimed] = await dbHttp
    .update(partnerFeeClaimAttempts)
    .set({
      status: "sending",
      attemptCount: sql`${partnerFeeClaimAttempts.attemptCount} + 1`,
      startedAt: new Date(),
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(partnerFeeClaimAttempts.id, attemptId),
        inArray(partnerFeeClaimAttempts.status, [
          "pending",
          "failed",
          "review",
        ]),
      ),
    )
    .returning({
      id: partnerFeeClaimAttempts.id,
      partnerWallet: partnerFeeClaimAttempts.partnerWallet,
      partnerConfigKey: partnerFeeClaimAttempts.partnerConfigKey,
    });

  if (!claimed) return await loadExistingResult(attemptId);

  let before: PartnerClaimStatsJson | null = null;
  const signatures: string[] = [];
  try {
    before = await bags.getPartnerClaimStats(claimed.partnerWallet, {
      cache: false,
    });
    if (BigInt(before.unclaimedFees) <= 0n) {
      return await markAttemptFailed(attemptId, "no_partner_fees_to_claim", {
        before,
      });
    }

    const txs = await bags.getPartnerClaimTransactions(claimed.partnerWallet);
    if (txs.length === 0) {
      return await markAttemptFailed(attemptId, "no_partner_claim_transactions", {
        before,
      });
    }

    const conn = solanaConnection("confirmed");
    for (const tx of txs) {
      if (await isKillSwitchEnabled()) {
        throw new Error("kill_switch_enabled");
      }
      const signature = await bags.signAndSubmitTransaction(tx.transaction, {
        operation: "Bags partner fee claim transaction",
        bagsInstructionPolicy: "partner-claim",
      });
      await conn.confirmTransaction(signature, "confirmed");
      signatures.push(signature);
    }

    const after = await bags.getPartnerClaimStats(claimed.partnerWallet, {
      cache: false,
    });
    const deltas = derivePartnerClaimDeltas(before, after);
    const suspicious =
      deltas.claimedDeltaLamports <= 0n ||
      deltas.unclaimedDeltaLamports >= 0n;

    await dbHttp
      .update(partnerFeeClaimAttempts)
      .set({
        status: suspicious ? "review" : "succeeded",
        beforeStats: before,
        afterStats: after,
        signatures,
        claimedDeltaLamports: deltas.claimedDeltaLamports,
        unclaimedDeltaLamports: deltas.unclaimedDeltaLamports,
        error: suspicious ? "partner_claim_delta_not_observed" : null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(partnerFeeClaimAttempts.id, attemptId));

    return {
      attemptId,
      status: suspicious ? "review" : "succeeded",
      partnerWallet: claimed.partnerWallet,
      signatures,
      before,
      after,
      claimedDeltaLamports: deltas.claimedDeltaLamports.toString(),
      unclaimedDeltaLamports: deltas.unclaimedDeltaLamports.toString(),
      reason: suspicious ? "partner_claim_delta_not_observed" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (signatures.length > 0) {
      return await markAttemptReview(
        attemptId,
        `${MANUAL_RECONCILIATION_ERROR}:claim_signatures=${signatures.join(",")};${message}`,
        { before, signatures },
      );
    }
    return await markAttemptFailed(attemptId, message, { before });
  }
}

async function loadExistingResult(
  attemptId: string,
): Promise<PartnerFeeClaimResult> {
  const [row] = await dbHttp
    .select({
      partnerWallet: partnerFeeClaimAttempts.partnerWallet,
      status: partnerFeeClaimAttempts.status,
      signatures: partnerFeeClaimAttempts.signatures,
      beforeStats: partnerFeeClaimAttempts.beforeStats,
      afterStats: partnerFeeClaimAttempts.afterStats,
      claimedDeltaLamports: partnerFeeClaimAttempts.claimedDeltaLamports,
      unclaimedDeltaLamports: partnerFeeClaimAttempts.unclaimedDeltaLamports,
      error: partnerFeeClaimAttempts.error,
    })
    .from(partnerFeeClaimAttempts)
    .where(eq(partnerFeeClaimAttempts.id, attemptId))
    .limit(1);
  if (!row) throw new Error("partner_fee_claim_attempt_not_found");
  return {
    attemptId,
    status:
      row.status === "succeeded" || row.status === "failed" || row.status === "review"
        ? row.status
        : "skipped",
    partnerWallet: row.partnerWallet,
    signatures: row.signatures,
    before: row.beforeStats,
    after: row.afterStats,
    claimedDeltaLamports: row.claimedDeltaLamports.toString(),
    unclaimedDeltaLamports: row.unclaimedDeltaLamports.toString(),
    reason: row.error ?? "attempt_not_pending",
  };
}

async function markAttemptFailed(
  attemptId: string,
  reason: string,
  extra?: { before?: PartnerClaimStatsJson | null },
): Promise<PartnerFeeClaimResult> {
  const [row] = await dbHttp
    .update(partnerFeeClaimAttempts)
    .set({
      status: "failed",
      beforeStats: extra?.before ?? undefined,
      error: reason.slice(0, 1_000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(partnerFeeClaimAttempts.id, attemptId))
    .returning({
      partnerWallet: partnerFeeClaimAttempts.partnerWallet,
      beforeStats: partnerFeeClaimAttempts.beforeStats,
    });
  return {
    attemptId,
    status: "failed",
    partnerWallet: row?.partnerWallet ?? "",
    signatures: [],
    before: row?.beforeStats ?? extra?.before ?? null,
    after: null,
    claimedDeltaLamports: "0",
    unclaimedDeltaLamports: "0",
    reason,
  };
}

async function markAttemptReview(
  attemptId: string,
  reason: string,
  extra: { before?: PartnerClaimStatsJson | null; signatures: string[] },
): Promise<PartnerFeeClaimResult> {
  const [row] = await dbHttp
    .update(partnerFeeClaimAttempts)
    .set({
      status: "review",
      beforeStats: extra.before ?? undefined,
      signatures: extra.signatures,
      error: reason.slice(0, 1_000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(partnerFeeClaimAttempts.id, attemptId))
    .returning({
      partnerWallet: partnerFeeClaimAttempts.partnerWallet,
      beforeStats: partnerFeeClaimAttempts.beforeStats,
    });
  return {
    attemptId,
    status: "review",
    partnerWallet: row?.partnerWallet ?? "",
    signatures: extra.signatures,
    before: row?.beforeStats ?? extra.before ?? null,
    after: null,
    claimedDeltaLamports: "0",
    unclaimedDeltaLamports: "0",
    reason,
  };
}
