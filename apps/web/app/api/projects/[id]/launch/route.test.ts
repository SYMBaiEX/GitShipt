import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  project: {} as Record<string, unknown>, selectCount: 0, walletLinked: true,
  ownerCheck: vi.fn(), partnerCheck: vi.fn(), resolveContributors: vi.fn(), record: vi.fn(), verify: vi.fn(), load: vi.fn(),
  info: vi.fn(), feeConfig: vi.fn(), launchTx: vi.fn(), modeGuard: vi.fn(), payer: "", treasury: "",
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: () => ({ api: { getSession: async () => ({ user: { id: "user" } }) } }) }));
vi.mock("@/db", () => ({ dbHttp: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => {
    state.selectCount++;
    if (state.selectCount === 1) return [{ status: state.project.status, simulatedAt: null }];
    if (state.selectCount === 2) return state.walletLinked ? [{ id: "wallet" }] : [];
    return [state.project];
  } }) }) }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => {
    Object.assign(state.project, values);
    return { returning: async () => [{ id: "project" }], then: (resolve: (value: undefined) => void) => resolve(undefined) };
  } }) }),
} }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: async () => undefined, PermissionError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ check: async () => ({ success: true }) }));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/idempotency", () => ({ validateClientKey: (key: string) => key, withIdempotency: async (_key: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/env", () => ({ hasCredentials: { db: () => true, bags: () => true }, canLaunchOnBags: state.modeGuard, serverEnv: () => ({ SOLANA_TREASURY_ADDRESS: state.treasury, BAGS_INITIAL_BUY_LAMPORTS: 0 }), stubsAllowed: () => false }));
vi.mock("@/lib/bags/client", () => ({ bags: { createTokenInfo: state.info, createFeeShareConfig: state.feeConfig, createLaunchTransactionForWallet: state.launchTx } }));
vi.mock("@/lib/solana/signer", () => ({ payoutSignerPublicKey: () => state.payer }));
vi.mock("@/lib/bags/launch-integration", () => ({ recordLaunch: state.record, verifyRecordedFeeShareHeader: state.verify }));
vi.mock("@/lib/bags/launch-claimers", () => ({ loadRecordedLaunchClaimers: state.load, resolveDirectLaunchClaimers: state.resolveContributors, assertLaunchPartnerReady: state.partnerCheck }));
vi.mock("@/lib/github/repo-owner", () => ({ requirePersonalRepoOwner: state.ownerCheck, RepoOwnerError: class extends Error { code = "not_repo_owner"; status = 403; } }));
vi.mock("@/lib/cache", () => ({ revalidateProjectCaches: async () => undefined }));
vi.mock("@/lib/workflow-locks", () => ({ acquireWorkflowLock: async () => ({ acquired: true }), releaseWorkflowLock: async () => undefined }));
vi.mock("@/lib/platform-fee", () => ({ platformFeeBps: async () => 1000 }));

const owner = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const configKey = Keypair.generate().publicKey.toBase58();
async function post(wallet = owner) {
  const { POST } = await import("./route");
  return POST(new Request("https://example.test/api/projects/project/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ launchWalletAddress: wallet, reviewedPlatformFeeBps: 1000 }) }), { params: Promise.resolve({ id: "project" }) });
}

describe("owner rewards launch API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.modeGuard.mockImplementation((mode?: string) => mode === "contributors" ? { ok: false, reason: "SOLANA_MANAGER_KEYPAIR missing" } : { ok: true });
    state.selectCount = 0; state.walletLinked = true;
    state.payer = Keypair.generate().publicKey.toBase58();
    state.treasury = Keypair.generate().publicKey.toBase58();
    state.project = { id: "project", status: "draft", ghOwner: "alice", ghRepo: "repo", ghRepoId: "123", ghInstallationId: null, name: "Repo", symbol: "REPO", description: "test", imageUrl: "https://example.test/image.png", payoutConfig: { rewardMode: "owner" }, platformFeeBps: 1000 };
    state.info.mockResolvedValue({ tokenMint: mint, tokenMetadata: "https://example.test/metadata" });
    state.feeConfig.mockResolvedValue({ configKey, txSignatures: [] });
    state.launchTx.mockResolvedValue({ transactionBase64: "prepared" });
  });

  it("prepares owner and platform claimers without contributor indexing or an app installation", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.ownerCheck).toHaveBeenCalledWith({ userId: "user", ghOwner: "alice", ghRepo: "repo", ghRepoId: "123" });
    expect(state.modeGuard).toHaveBeenCalledWith("owner");
    expect(state.resolveContributors).not.toHaveBeenCalled();
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ rewardMode: "owner", adminPubkey: owner, claimers: [expect.objectContaining({ claimerPubkey: owner, initialBps: 9000 }), expect.objectContaining({ claimerPubkey: state.treasury, initialBps: 1000 })] }));
    expect(state.verify).toHaveBeenCalledBefore(state.launchTx);
    expect(state.feeConfig).toHaveBeenCalledWith(expect.objectContaining({ payer: state.payer, admin: owner, shareFee: 0 }));
  });

  it("refuses an unlinked wallet before creating token metadata", async () => {
    state.walletLinked = false;
    expect((await post()).status).toBe(403);
    expect(state.info).not.toHaveBeenCalled();
  });

  it("rejects a repository that fails personal-owner verification", async () => {
    const { RepoOwnerError } = await import("@/lib/github/repo-owner");
    state.ownerCheck.mockRejectedValueOnce(new RepoOwnerError("not_repo_owner", 403, "Not a personal owner"));
    expect((await post()).status).toBe(403);
    expect(state.info).not.toHaveBeenCalled();
  });

  it("does not prepare the final wallet transaction when header verification fails", async () => {
    state.verify.mockRejectedValueOnce(new Error("invalid on-chain header"));
    expect((await post()).status).toBe(500);
    expect(state.launchTx).not.toHaveBeenCalled();
  });

  it("revalidates owner and recorded manifest before preparing a resumed launch", async () => {
    Object.assign(state.project, { status: "launch_configured", tokenMint: mint, bagsConfigKey: configKey, bagsTokenMetadata: "https://example.test/metadata", bagsLaunchWallet: owner, bagsInitialBuyLamports: 0 });
    expect((await post()).status).toBe(200);
    expect(state.ownerCheck).toHaveBeenCalled();
    expect(state.load).toHaveBeenCalledBefore(state.verify);
    expect(state.verify).toHaveBeenCalledBefore(state.launchTx);
    expect(state.info).not.toHaveBeenCalled();
  });

  it("does not prepare a resumed launch if the recorded manifest is rejected", async () => {
    Object.assign(state.project, { status: "launch_configured", tokenMint: mint, bagsConfigKey: configKey, bagsTokenMetadata: "https://example.test/metadata", bagsLaunchWallet: owner, bagsInitialBuyLamports: 0 });
    state.load.mockRejectedValueOnce(new Error("manifest mismatch"));
    expect((await post()).status).toBe(500);
    expect(state.launchTx).not.toHaveBeenCalled();
  });

  it("rejects a different linked wallet on resume", async () => {
    Object.assign(state.project, { status: "launch_configured", tokenMint: mint, bagsConfigKey: configKey, bagsTokenMetadata: "https://example.test/metadata", bagsLaunchWallet: owner, bagsInitialBuyLamports: 0 });
    expect((await post(Keypair.generate().publicKey.toBase58())).status).toBe(409);
    expect(state.launchTx).not.toHaveBeenCalled();
  });
});
