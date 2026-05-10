import { getStepMetadata } from "workflow";
import {
  executePartnerFeeClaimAttempt,
  reservePartnerFeeClaimAttempt,
  type PartnerFeeClaimResult,
} from "@/lib/funds/partner-fee-claims";
import { hasCredentials, serverEnv, stubsAllowed } from "@/lib/env";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import {
  acquireWorkflowLock,
  releaseWorkflowLock,
  type WorkflowLock,
} from "@/lib/workflow-locks";

/**
 * Claim GitShipt partner fees through Bags-native claim transactions.
 *
 * The workflow only reserves a local attempt row with a workflow step id. The
 * external side effect is still Bags-provided transaction signing/submission in
 * `executePartnerFeeClaimAttempt`, which verifies the instruction policy before
 * the payout signer touches the transaction.
 */
export async function claimPartnerFeesWorkflow(): Promise<PartnerFeeClaimResult> {
  "use workflow";

  const lock = await acquirePartnerClaimLockStep();
  if (!lock.acquired) return await skippedPartnerClaimStep("claim_in_progress");

  try {
    const input = await loadPartnerClaimInputStep();
    if ("skipReason" in input)
      return await skippedPartnerClaimStep(input.skipReason);
    const attempt = await reservePartnerClaimAttemptStep(input);
    return await executePartnerClaimAttemptStep(attempt.id);
  } finally {
    await releasePartnerClaimLockStep(lock);
  }
}

async function acquirePartnerClaimLockStep(): Promise<WorkflowLock> {
  "use step";
  return await acquireWorkflowLock("claimPartnerFees", "partner-fees", 30 * 60);
}

async function releasePartnerClaimLockStep(lock: WorkflowLock): Promise<void> {
  "use step";
  if (!lock.acquired) return;
  await releaseWorkflowLock(lock);
}

async function loadPartnerClaimInputStep(): Promise<
  | {
      partnerWallet: string;
      partnerConfigKey: string;
    }
  | {
      skipReason: string;
    }
> {
  "use step";
  const env = serverEnv();
  if (!hasCredentials.bagsPartner() || !hasCredentials.payoutKey()) {
    if (stubsAllowed()) {
      return {
        skipReason: "missing_bags_partner_credentials_or_solana_payout_keypair",
      };
    }
    throw new Error(
      "Live Bags partner credentials and SOLANA_PAYOUT_KEYPAIR are required to claim partner fees in production.",
    );
  }

  const signerWallet = payoutSignerPublicKey();
  if (!signerWallet) {
    throw new Error("SOLANA_PAYOUT_KEYPAIR is not configured.");
  }
  if (signerWallet !== env.BAGS_PARTNER_WALLET) {
    throw new Error(
      "BAGS_PARTNER_WALLET must match the public key derived from SOLANA_PAYOUT_KEYPAIR before partner fee claims can run.",
    );
  }
  if (!env.BAGS_PARTNER_CONFIG_KEY) {
    throw new Error("BAGS_PARTNER_CONFIG_KEY is not configured.");
  }

  return {
    partnerWallet: env.BAGS_PARTNER_WALLET,
    partnerConfigKey: env.BAGS_PARTNER_CONFIG_KEY,
  };
}

async function reservePartnerClaimAttemptStep(input: {
  partnerWallet: string;
  partnerConfigKey: string;
}): Promise<{ id: string; status: string }> {
  "use step";
  return await reservePartnerFeeClaimAttempt({
    ...input,
    idempotencyKey: getStepMetadata().stepId,
  });
}

async function executePartnerClaimAttemptStep(
  attemptId: string,
): Promise<PartnerFeeClaimResult> {
  "use step";
  return await executePartnerFeeClaimAttempt(attemptId);
}

async function skippedPartnerClaimStep(
  reason: string,
): Promise<PartnerFeeClaimResult> {
  "use step";
  const env = serverEnv();
  return {
    attemptId: "skipped",
    status: "skipped",
    partnerWallet: env.BAGS_PARTNER_WALLET,
    signatures: [],
    before: null,
    after: null,
    claimedDeltaLamports: "0",
    unclaimedDeltaLamports: "0",
    reason,
  };
}
