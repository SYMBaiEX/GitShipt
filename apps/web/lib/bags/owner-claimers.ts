import { PublicKey } from "@solana/web3.js";
import { PLATFORM_CLAIMER_MARKER } from "@/lib/payouts/bps-plan";
import type { LaunchClaimerInput } from "./launch-integration";

export const OWNER_CLAIMER_MARKER = "gitshipt:owner";

function canonicalWallet(value: string): string {
  const canonical = new PublicKey(value).toBase58();
  if (canonical !== value) throw new Error("Wallet must be a canonical Solana public key.");
  return canonical;
}

function validateFee(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) {
    throw new Error("Owner rewards require a platform allocation from 0 to 9999 BPS.");
  }
}

export function buildOwnerLaunchClaimers(
  ownerWallet: string,
  platformWallet: string | undefined,
  feeBps: number,
): LaunchClaimerInput[] {
  validateFee(feeBps);
  const owner = canonicalWallet(ownerWallet);
  const claimers: LaunchClaimerInput[] = [{
    slotIndex: 0, claimerPubkey: owner, provider: "wallet",
    socialHandle: OWNER_CLAIMER_MARKER, contributorId: null, initialBps: 10_000 - feeBps,
  }];
  if (feeBps > 0) {
    if (!platformWallet) throw new Error("Platform treasury wallet is required.");
    const platform = canonicalWallet(platformWallet);
    if (owner === platform) throw new Error("Owner and platform wallets must be distinct.");
    claimers.push({
      slotIndex: 1, claimerPubkey: platform, provider: "wallet",
      socialHandle: PLATFORM_CLAIMER_MARKER, contributorId: null, initialBps: feeBps,
    });
  }
  return claimers;
}

/** Check persisted slots against the launch snapshot, never today's treasury env. */
export function validateOwnerLaunchClaimers(
  claimers: LaunchClaimerInput[],
  ownerWallet: string,
  feeBps: number,
): void {
  validateFee(feeBps);
  const owner = canonicalWallet(ownerWallet);
  if (claimers.length !== (feeBps > 0 ? 2 : 1)) throw new Error("Invalid owner rewards claimer count.");
  const first = claimers[0];
  if (!first || first.slotIndex !== 0 || first.provider !== "wallet" || first.socialHandle !== OWNER_CLAIMER_MARKER || first.contributorId != null || first.claimerPubkey !== owner || first.initialBps !== 10_000 - feeBps) {
    throw new Error("Invalid owner rewards recipient.");
  }
  if (feeBps > 0) {
    const platform = claimers[1];
    if (!platform || platform.slotIndex !== 1 || platform.provider !== "wallet" || platform.socialHandle !== PLATFORM_CLAIMER_MARKER || platform.contributorId != null || platform.initialBps !== feeBps || canonicalWallet(platform.claimerPubkey) === owner) {
      throw new Error("Invalid platform rewards recipient.");
    }
  }
}
