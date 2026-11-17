import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn(), reserve: vi.fn(), execute: vi.fn() }));
vi.mock("workflow", () => ({ getStepMetadata: () => ({ stepId: "step" }) }));
vi.mock("@/lib/funds/partner-fee-claims", () => ({ reservePartnerFeeClaimAttempt: mocks.reserve, executePartnerFeeClaimAttempt: mocks.execute }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ BAGS_PARTNER_WALLET: "partner", BAGS_PARTNER_CONFIG_KEY: "config" }), hasCredentials: { bagsPartner: () => true, payoutKey: () => true }, stubsAllowed: () => false }));
vi.mock("@/lib/solana/signer", () => ({ payoutSignerPublicKey: () => "different-payer" }));
vi.mock("@/lib/workflow-locks", () => ({ acquireWorkflowLock: async () => ({ acquired: true, key: "key", token: "token" }), releaseWorkflowLock: async () => undefined }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

describe("claimPartnerFeesWorkflow", () => {
  it("audits and skips automatic claim when payer differs from partner", async () => {
    const { claimPartnerFeesWorkflow } = await import("./claimPartnerFees");
    const result = await claimPartnerFeesWorkflow();
    expect(result).toMatchObject({ status: "skipped", reason: "manual_claim_required" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "bags.partner_claim_skipped" }));
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
