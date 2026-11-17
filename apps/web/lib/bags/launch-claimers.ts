import { and, asc, desc, eq, gt } from "drizzle-orm";
import { dbHttp } from "@/db";
import {
  bagsClaimerSlots,
  bagsFeeShareConfigs,
  contributors,
} from "@/db/schema";
import { bags } from "@/lib/bags/client";
import type { LaunchClaimerInput } from "@/lib/bags/launch-integration";
import { allocateBpsByScore } from "@/lib/payouts/bps-plan";
import { tradingHalt } from "@/lib/trading-controls";
import { serverEnv } from "@/lib/env";
import { PublicKey } from "@solana/web3.js";
import { BAGS_FEE_SHARE_V2_PROGRAM_ID } from "@/lib/bags/program-client";
import { payoutSignerPublicKey } from "@/lib/solana/signer";
import { solanaConnection } from "@/lib/solana/connection";

async function assertLaunchPartnerReady(): Promise<void> {
  const env = serverEnv();
  const partner = new PublicKey(env.BAGS_PARTNER_WALLET);
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("partner_config"), partner.toBuffer()],
    BAGS_FEE_SHARE_V2_PROGRAM_ID,
  );
  if (config.toBase58() !== env.BAGS_PARTNER_CONFIG_KEY) {
    throw new Error(
      "BAGS_PARTNER_CONFIG_KEY does not match BAGS_PARTNER_WALLET's on-chain partner configuration.",
    );
  }
  if (payoutSignerPublicKey() !== env.BAGS_PARTNER_WALLET) {
    throw new Error(
      "BAGS_PARTNER_WALLET must match SOLANA_PAYOUT_KEYPAIR for automatic platform fee claims.",
    );
  }
  const account = await solanaConnection("confirmed").getAccountInfo(config);
  if (!account?.owner.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)) {
    throw new Error(
      "Bags partner configuration is missing or has an unexpected program owner.",
    );
  }
  const state = await bags.getPartnerConfig();
  if (state.partner !== env.BAGS_PARTNER_WALLET || state.bps !== 2_500) {
    throw new Error(
      "Bags partner configuration must name the GitShipt partner wallet with a 2500 BPS fee rate.",
    );
  }
}

export interface LaunchCandidate {
  id: string;
  ghUsername: string;
  score: number;
}

/** Skip unlinked contributors and normalize the eligible shares to 10,000 BPS. */
export function buildDirectLaunchClaimers(
  candidates: LaunchCandidate[],
  resolved: Array<{ username: string; wallet: string | null }>,
): LaunchClaimerInput[] {
  const wallets = new Map(
    resolved.map((r) => [r.username.toLowerCase(), r.wallet]),
  );
  const linked = candidates.filter(
    (c) =>
      Number.isFinite(c.score) &&
      c.score > 0 &&
      wallets.get(c.ghUsername.toLowerCase()),
  );
  if (linked.length === 0) {
    throw new Error(
      "No scored contributors have Bags-linked GitHub wallets. Onboard at least one contributor on Bags, then retry.",
    );
  }
  const keys = linked.map((c) => wallets.get(c.ghUsername.toLowerCase())!);
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "Multiple contributors resolve to the same Bags wallet. Review contributor identities before launching.",
    );
  }
  const slots = linked.map((c, slotIndex) => ({
    slotIndex,
    githubLogin: c.ghUsername.toLowerCase(),
    contributorId: c.id,
    currentBps: 0,
  }));
  const plan = allocateBpsByScore(
    slots,
    linked.map((c) => ({
      contributorId: c.id,
      ghUsername: c.ghUsername,
      score: c.score,
    })),
  );
  return linked
    .map((c, slotIndex) => ({
      slotIndex,
      claimerPubkey: keys[slotIndex]!,
      provider: "github" as const,
      socialHandle: c.ghUsername,
      contributorId: c.id,
      initialBps: plan.bps[slotIndex]!,
    }))
    .filter((c) => c.initialBps > 0)
    .map((c, slotIndex) => ({ ...c, slotIndex }));
}

export async function resolveDirectLaunchClaimers(
  projectId: string,
  maxClaimers: number,
): Promise<LaunchClaimerInput[]> {
  const halt = await tradingHalt(projectId);
  if (halt.halted)
    throw new Error(`Token creation is paused: ${halt.reason ?? halt.scope}`);
  await assertLaunchPartnerReady();
  const rows = await dbHttp
    .select()
    .from(contributors)
    .where(
      and(
        eq(contributors.projectId, projectId),
        eq(contributors.excluded, "false"),
        gt(contributors.score, 0),
      ),
    )
    .orderBy(
      asc(contributors.rank),
      desc(contributors.score),
      asc(contributors.ghUsername),
    )
    .limit(Math.min(100, maxClaimers));
  if (
    rows.length === 0 ||
    rows.some(
      (r) =>
        !r.lastIndexedAt || r.lastIndexedAt.getTime() < Date.now() - 86_400_000,
    )
  ) {
    throw new Error(
      "Index this repository's contributors before launching (POST /api/projects/{id}/reindex), then retry once the leaderboard is ready.",
    );
  }
  const resolved = await bags.resolveLaunchWalletsBulk(
    rows.map((c) => ({ provider: "github", username: c.ghUsername })),
  );
  const claimers = buildDirectLaunchClaimers(rows, resolved);
  if (claimers.length > 15)
    throw new Error(
      "Launches with more than 15 linked contributors need the Bags lookup-table setup. Reduce maxClaimers to 15 for the debut launch.",
    );
  return claimers;
}

export async function loadRecordedLaunchClaimers(
  projectId: string,
): Promise<LaunchClaimerInput[]> {
  const halt = await tradingHalt(projectId);
  if (halt.halted)
    throw new Error(`Token creation is paused: ${halt.reason ?? halt.scope}`);
  await assertLaunchPartnerReady();
  const rows = await dbHttp
    .select({
      slotIndex: bagsClaimerSlots.slotIndex,
      claimerPubkey: bagsClaimerSlots.claimerPubkey,
      provider: bagsClaimerSlots.provider,
      socialHandle: bagsClaimerSlots.socialHandle,
      contributorId: bagsClaimerSlots.contributorId,
      initialBps: bagsClaimerSlots.initialBps,
    })
    .from(bagsClaimerSlots)
    .innerJoin(
      bagsFeeShareConfigs,
      eq(bagsFeeShareConfigs.id, bagsClaimerSlots.feeShareConfigId),
    )
    .where(eq(bagsFeeShareConfigs.projectId, projectId))
    .orderBy(asc(bagsClaimerSlots.slotIndex));
  if (
    rows.length === 0 ||
    rows.some((r) => r.provider !== "github" || !r.contributorId)
  ) {
    throw new Error(
      "This prepared launch has no direct contributor claimer manifest. Reconcile the old pool configuration before launching.",
    );
  }
  return rows;
}
