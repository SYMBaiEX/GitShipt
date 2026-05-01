import { dbHttp } from "@/db";
import {
  escrowHoldings,
  feeShareUpdateAttempts,
  fundReconciliationRuns,
  partnerFeeClaimAttempts,
  payouts,
  payoutRecipients,
} from "@/db/schema";
import type { FundReconciliationIssueJson } from "@/db/schema/fund-reconciliation";
import { summarizeFundIssues } from "@/lib/funds/accounting";
import { enterDbWorkflowContext } from "@/lib/db-rls";
import { hasCredentials } from "@/lib/env";
import {
  getHotWalletBalance,
  isKillSwitchEnabled,
} from "@/lib/payouts/safety";
import { solanaConnection } from "@/lib/solana/connection";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

const MANUAL_RECONCILIATION_PATTERN =
  "%manual_reconciliation_required_external_side_effect_may_have_succeeded%";
const STALE_RECONCILIATION_MS = 10 * 60 * 1000;
const SIGNATURE_BATCH_SIZE = 100;

export interface FundReconciliationSummary {
  status: "clean" | "warning" | "critical";
  hotWalletAddress: string | null;
  hotWalletBalanceLamports: string;
  escrowLiabilityLamports: string;
  unsettledRecipientLamports: string;
  manualReviewCount: number;
  finalizedSignatureCount: number;
  staleSignatureCount: number;
  issues: FundReconciliationIssueJson[];
}

export async function runFundReconciliation(): Promise<FundReconciliationSummary> {
  enterDbWorkflowContext("fund-reconciliation:run");
  const finalizedSignatureCount = await promoteFinalizedSignatures();
  const [
    escrowLiabilityLamports,
    unsettledRecipientLamports,
    manualReviewCount,
    activeSplEscrowCount,
    staleSignatureCount,
    killSwitchEnabled,
  ] = await Promise.all([
    sumSolEscrowLiabilities(),
    sumUnsettledRecipientLiabilities(),
    countManualReviewRows(),
    countActiveSplEscrow(),
    countStaleSignatureRows(),
    isKillSwitchEnabled(),
  ]);

  const hotWalletAddress = payoutSignerPublicKey();
  const hotWalletBalanceLamports =
    hotWalletAddress && hasCredentials.solana()
      ? await getHotWalletBalance()
      : 0n;

  const summarized = summarizeFundIssues({
    hotWalletAddress,
    hotWalletBalanceLamports,
    escrowLiabilityLamports,
    unsettledRecipientLamports,
    manualReviewCount,
    staleSignatureCount,
    activeSplEscrowCount,
    killSwitchEnabled,
  });

  await dbHttp.insert(fundReconciliationRuns).values({
    status: summarized.status,
    hotWalletAddress,
    hotWalletBalanceLamports,
    escrowLiabilityLamports,
    unsettledRecipientLamports,
    manualReviewCount,
    finalizedSignatureCount,
    staleSignatureCount,
    issues: summarized.issues,
    checkedAt: new Date(),
  });

  return {
    status: summarized.status,
    hotWalletAddress,
    hotWalletBalanceLamports: hotWalletBalanceLamports.toString(),
    escrowLiabilityLamports: escrowLiabilityLamports.toString(),
    unsettledRecipientLamports: unsettledRecipientLamports.toString(),
    manualReviewCount,
    finalizedSignatureCount,
    staleSignatureCount,
    issues: summarized.issues,
  };
}

async function scalarBigint(query: Parameters<typeof dbHttp.execute>[0]): Promise<bigint> {
  const result = await dbHttp.execute<{ amount: string | number | bigint | null }>(
    query,
  );
  return BigInt(result.rows[0]?.amount ?? 0);
}

async function scalarCount(query: Parameters<typeof dbHttp.execute>[0]): Promise<number> {
  const result = await dbHttp.execute<{ count: string | number | bigint | null }>(
    query,
  );
  return Number(result.rows[0]?.count ?? 0);
}

function staleCutoff(): Date {
  return new Date(Date.now() - STALE_RECONCILIATION_MS);
}

async function sumSolEscrowLiabilities(): Promise<bigint> {
  return scalarBigint(sql`
    select coalesce(sum(amount_lamports), 0)::text as amount
    from escrow_holdings
    where drained_at is null
      and token_mint is null
  `);
}

async function sumUnsettledRecipientLiabilities(): Promise<bigint> {
  return scalarBigint(sql`
    select coalesce(sum(pr.amount_lamports), 0)::text as amount
    from payout_recipients pr
    join payouts p on p.id = pr.payout_id
    where pr.status in ('pending', 'sending', 'failed')
      and (
        p.status in ('pending', 'distributing')
        or (
          p.status = 'failed'
          and (
            p.last_error like ${MANUAL_RECONCILIATION_PATTERN}
            or (
              p.claim_signature is not null
              and p.claim_finalized_at is null
            )
          )
        )
      )
  `);
}

async function countActiveSplEscrow(): Promise<number> {
  return scalarCount(sql`
    select count(*)::int as count
    from escrow_holdings
    where drained_at is null
      and token_mint is not null
  `);
}

async function countManualReviewRows(): Promise<number> {
  return scalarCount(sql`
    select (
      (select count(*) from payouts
       where last_error like ${MANUAL_RECONCILIATION_PATTERN}
          or (
            status = 'failed'
            and claim_signature is not null
            and claim_finalized_at is null
          ))
      +
      (select count(*) from payout_recipients where error like ${MANUAL_RECONCILIATION_PATTERN})
      + (select count(*) from escrow_holdings where drain_error like ${MANUAL_RECONCILIATION_PATTERN})
      + (select count(*) from fee_share_update_attempts where error like ${MANUAL_RECONCILIATION_PATTERN})
      + (select count(*) from partner_fee_claim_attempts where status = 'review' or error like ${MANUAL_RECONCILIATION_PATTERN})
    )::int as count
  `);
}

async function countStaleSignatureRows(): Promise<number> {
  const cutoff = staleCutoff();
  return scalarCount(sql`
    select (
      (select count(*) from payout_recipients where status = 'sending' and sending_at < ${cutoff})
      + (select count(*) from escrow_holdings where drain_attempt_id is not null and draining_at < ${cutoff} and drained_at is null)
      + (select count(*) from fee_share_update_attempts where status = 'sending' and started_at < ${cutoff})
      + (select count(*) from partner_fee_claim_attempts where status = 'sending' and started_at < ${cutoff})
    )::int as count
  `);
}

async function promoteFinalizedSignatures(): Promise<number> {
  if (!hasCredentials.solana()) return 0;
  let finalized = 0;
  finalized += await promoteRecipientFinality();
  finalized += await promoteEscrowFinality();
  finalized += await promotePayoutClaimFinality();
  finalized += await promoteFeeShareUpdateFinality();
  finalized += await promotePartnerClaimFinality();
  return finalized;
}

async function finalizedSignatures(
  signatures: readonly string[],
): Promise<Set<string>> {
  const filtered = signatures.filter((sig) => sig && sig !== "stub-mode-drain");
  const result = new Set<string>();
  if (filtered.length === 0) return result;
  const conn = solanaConnection("confirmed");
  for (let i = 0; i < filtered.length; i += SIGNATURE_BATCH_SIZE) {
    const batch = filtered.slice(i, i + SIGNATURE_BATCH_SIZE);
    const statuses = await conn.getSignatureStatuses(batch, {
      searchTransactionHistory: true,
    });
    statuses.value.forEach((status, index) => {
      if (status?.confirmationStatus === "finalized" && !status.err) {
        result.add(batch[index] ?? "");
      }
    });
  }
  return result;
}

async function promoteRecipientFinality(): Promise<number> {
  const rows = await dbHttp
    .select({
      id: payoutRecipients.id,
      txSignature: payoutRecipients.txSignature,
    })
    .from(payoutRecipients)
    .where(
      and(
        isNotNull(payoutRecipients.txSignature),
        isNull(payoutRecipients.finalizedAt),
        inArray(payoutRecipients.status, ["sent", "confirmed"]),
      ),
    )
    .limit(SIGNATURE_BATCH_SIZE);
  const finalized = await finalizedSignatures(
    rows
      .map((row) => row.txSignature)
      .filter((sig): sig is string => Boolean(sig)),
  );
  const idsToUpdate = rows
    .filter((row) => row.txSignature && finalized.has(row.txSignature))
    .map((row) => row.id);
  if (idsToUpdate.length > 0) {
    await dbHttp
      .update(payoutRecipients)
      .set({ finalizedAt: new Date() })
      .where(inArray(payoutRecipients.id, idsToUpdate));
  }
  return idsToUpdate.length;
}

async function promoteEscrowFinality(): Promise<number> {
  const rows = await dbHttp
    .select({
      id: escrowHoldings.id,
      drainSignature: escrowHoldings.drainSignature,
    })
    .from(escrowHoldings)
    .where(
      and(
        isNotNull(escrowHoldings.drainSignature),
        isNull(escrowHoldings.drainFinalizedAt),
      ),
    )
    .limit(SIGNATURE_BATCH_SIZE);
  const finalized = await finalizedSignatures(
    rows
      .map((row) => row.drainSignature)
      .filter((sig): sig is string => Boolean(sig)),
  );
  const idsToUpdate = rows
    .filter((row) => row.drainSignature && finalized.has(row.drainSignature))
    .map((row) => row.id);
  if (idsToUpdate.length > 0) {
    await dbHttp
      .update(escrowHoldings)
      .set({ drainFinalizedAt: new Date() })
      .where(inArray(escrowHoldings.id, idsToUpdate));
  }
  return idsToUpdate.length;
}

async function promotePayoutClaimFinality(): Promise<number> {
  const rows = await dbHttp
    .select({ id: payouts.id, claimSignature: payouts.claimSignature })
    .from(payouts)
    .where(and(isNotNull(payouts.claimSignature), isNull(payouts.claimFinalizedAt)))
    .limit(SIGNATURE_BATCH_SIZE);
  const allSignatures = Array.from(
    new Set(rows.flatMap((row) => splitSignatures(row.claimSignature))),
  );
  if (allSignatures.length === 0) return 0;

  const finalized = await finalizedSignatures(allSignatures);
  const idsToUpdate = rows
    .filter((row) => {
      const sigs = splitSignatures(row.claimSignature);
      return sigs.length > 0 && sigs.every((sig) => finalized.has(sig));
    })
    .map((row) => row.id);

  if (idsToUpdate.length > 0) {
    await dbHttp
      .update(payouts)
      .set({ claimFinalizedAt: new Date() })
      .where(inArray(payouts.id, idsToUpdate));
  }
  return idsToUpdate.length;
}

async function promoteFeeShareUpdateFinality(): Promise<number> {
  const rows = await dbHttp
    .select({
      id: feeShareUpdateAttempts.id,
      signatures: feeShareUpdateAttempts.signatures,
    })
    .from(feeShareUpdateAttempts)
    .where(
      and(
        eq(feeShareUpdateAttempts.status, "succeeded"),
        isNull(feeShareUpdateAttempts.finalizedAt),
      ),
    )
    .limit(SIGNATURE_BATCH_SIZE);
  const allSignatures = Array.from(new Set(rows.flatMap((row) => row.signatures)));
  if (allSignatures.length === 0) return 0;

  const finalized = await finalizedSignatures(allSignatures);
  const idsToUpdate = rows
    .filter((row) => {
      return (
        row.signatures.length > 0 &&
        row.signatures.every((sig) => finalized.has(sig))
      );
    })
    .map((row) => row.id);

  if (idsToUpdate.length > 0) {
    await dbHttp
      .update(feeShareUpdateAttempts)
      .set({ finalizedAt: new Date() })
      .where(inArray(feeShareUpdateAttempts.id, idsToUpdate));
  }
  return idsToUpdate.length;
}

async function promotePartnerClaimFinality(): Promise<number> {
  const rows = await dbHttp
    .select({
      id: partnerFeeClaimAttempts.id,
      signatures: partnerFeeClaimAttempts.signatures,
    })
    .from(partnerFeeClaimAttempts)
    .where(
      and(
        eq(partnerFeeClaimAttempts.status, "succeeded"),
        isNull(partnerFeeClaimAttempts.finalizedAt),
      ),
    )
    .limit(SIGNATURE_BATCH_SIZE);
  const allSignatures = Array.from(new Set(rows.flatMap((row) => row.signatures)));
  if (allSignatures.length === 0) return 0;

  const finalized = await finalizedSignatures(allSignatures);
  const idsToUpdate = rows
    .filter((row) => {
      return (
        row.signatures.length > 0 &&
        row.signatures.every((sig) => finalized.has(sig))
      );
    })
    .map((row) => row.id);

  if (idsToUpdate.length > 0) {
    await dbHttp
      .update(partnerFeeClaimAttempts)
      .set({ finalizedAt: new Date() })
      .where(inArray(partnerFeeClaimAttempts.id, idsToUpdate));
  }
  return idsToUpdate.length;
}

function splitSignatures(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((sig) => sig.trim())
    .filter(Boolean);
}
