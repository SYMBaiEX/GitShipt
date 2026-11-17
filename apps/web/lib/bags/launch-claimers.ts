import { and, asc, desc, eq, gt } from "drizzle-orm";
import { dbHttp } from "@/db";
import {
  bagsClaimerSlots,
  bagsFeeShareConfigs,
  contributors,
  projects,
} from "@/db/schema";
import { bags } from "@/lib/bags/client";
import type { LaunchClaimerInput } from "@/lib/bags/launch-integration";
import {
  allocateBpsByScore,
  PLATFORM_CLAIMER_MARKER,
  validatePlatformManifest,
} from "@/lib/payouts/bps-plan";
import { tradingHalt } from "@/lib/trading-controls";
import { serverEnv } from "@/lib/env";
import { PublicKey } from "@solana/web3.js";
import { BAGS_FEE_SHARE_V2_PROGRAM_ID } from "@/lib/bags/program-client";
import { solanaConnection } from "@/lib/solana/connection";
import { rewardModeOf } from "@repo/shared";
import { validateOwnerLaunchClaimers } from "./owner-claimers";
import { assertPlatformOnlyPartner } from "@/lib/bags/partner-config";

export async function assertLaunchPartnerReady(): Promise<void> {
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
  const account = await solanaConnection("confirmed").getAccountInfo(config);
  if (!account?.owner.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)) {
    throw new Error(
      "Bags partner configuration is missing or has an unexpected program owner.",
    );
  }
  const state = await bags.getPartnerConfig();
  assertPlatformOnlyPartner(state, env.BAGS_PARTNER_WALLET);
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
  platform?: { wallet: string; bps: number },
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
  if (
    platform &&
    (!Number.isInteger(platform.bps) ||
      platform.bps < 0 ||
      platform.bps > 10_000)
  ) {
    throw new Error("Invalid platform fee allocation.");
  }
  if (platform?.bps && keys.includes(platform.wallet)) {
    throw new Error(
      "Platform treasury wallet must be distinct from contributor wallets.",
    );
  }
  const plan = allocateBpsByScore(
    platform?.bps
      ? [
          ...slots,
          {
            slotIndex: slots.length,
            githubLogin: null,
            contributorId: null,
            currentBps: platform.bps,
            reservedBps: platform.bps,
          },
        ]
      : slots,
    linked.map((c) => ({
      contributorId: c.id,
      ghUsername: c.ghUsername,
      score: c.score,
    })),
  );
  const claimers: LaunchClaimerInput[] = linked
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
  if (platform?.bps)
    claimers.push({
      slotIndex: claimers.length,
      claimerPubkey: platform.wallet,
      provider: "wallet",
      socialHandle: PLATFORM_CLAIMER_MARKER,
      contributorId: null,
      initialBps: platform.bps,
    });
  return claimers;
}

export async function resolveDirectLaunchClaimers(
  projectId: string,
  maxClaimers: number,
  platformFeeBps: number,
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
  const treasury = serverEnv().SOLANA_TREASURY_ADDRESS;
  if (platformFeeBps > 0 && !treasury)
    throw new Error(
      "SOLANA_TREASURY_ADDRESS is required for the platform fee allocation.",
    );
  const claimers = buildDirectLaunchClaimers(
    rows,
    resolved,
    treasury ? { wallet: treasury, bps: platformFeeBps } : undefined,
  );
  if (claimers.length > 15)
    throw new Error(
      "Launches with more than 15 fee claimers, including the platform wallet, need Bags lookup-table setup. Reduce maxClaimers and retry.",
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
  const [project] = await dbHttp
    .select({ platformFeeBps: projects.platformFeeBps, payoutConfig: projects.payoutConfig, launchWallet: projects.bagsLaunchWallet })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Launch project not found.");
  if (rewardModeOf(project.payoutConfig) === "owner") {
    if (!project.launchWallet) throw new Error("Owner launch wallet is missing.");
    validateOwnerLaunchClaimers(rows, project.launchWallet, project.platformFeeBps);
    return rows;
  }
  if (
    rows.length === 0 ||
    rows.some(
      (r) =>
        !(r.provider === "github" && r.contributorId) &&
        !(
          r.provider === "wallet" &&
          r.socialHandle === PLATFORM_CLAIMER_MARKER &&
          !r.contributorId
        ),
    )
  ) {
    throw new Error(
      "This prepared launch has no direct contributor claimer manifest. Reconcile the old pool configuration before launching.",
    );
  }
  validatePlatformManifest(rows, project.platformFeeBps);
  return rows;
}
