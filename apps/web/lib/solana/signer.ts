import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { serverEnv, hasCredentials } from "@/lib/env";

let _payoutSigner: Keypair | null = null;
let _payoutFingerprint: string | null = null;

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Lazily decode the hot-wallet payout keypair from env. Throws if absent —
 * callers must guard with `hasCredentials.payoutKey()` for stubbed dev.
 *
 * SECURITY NOTES:
 *  - The keypair env var must be marked Sensitive in Vercel (post-April-2026
 *    incident).
 *  - Production should additionally enforce a daily balance cap on this
 *    wallet; refilled from cold treasury via MFA-gated admin action.
 *  - The cache is keyed by a SHA-256 fingerprint of the env value so a
 *    rotation in Vercel takes effect on the next call without a cold start.
 */
export function payoutSigner(): Keypair {
  const env = serverEnv();
  if (!env.SOLANA_PAYOUT_KEYPAIR) {
    throw new Error(
      "SOLANA_PAYOUT_KEYPAIR is not configured. Set it (base58-encoded) in Vercel as Sensitive.",
    );
  }
  const fp = fingerprint(env.SOLANA_PAYOUT_KEYPAIR);
  if (_payoutSigner && _payoutFingerprint === fp) return _payoutSigner;
  const decoded = bs58.decode(env.SOLANA_PAYOUT_KEYPAIR);
  _payoutSigner = Keypair.fromSecretKey(decoded);
  _payoutFingerprint = fp;
  return _payoutSigner;
}

export function payoutSignerPublicKey(): string | null {
  if (!hasCredentials.payoutKey()) return null;
  return payoutSigner().publicKey.toBase58();
}
