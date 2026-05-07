import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { serverEnv, hasCredentials } from "@/lib/env";

let _managerSigner: Keypair | null = null;

/**
 * Lazily decode the v1.1 manager keypair from env. Throws if absent —
 * callers must guard with `hasCredentials.managerKey()` for stubbed dev.
 *
 * SECURITY NOTES:
 *  - The keypair env var must be marked Sensitive in Vercel (post-April-2026
 *    incident).
 *  - This keypair holds the on-chain fee-share-config admin role per project.
 *    On-chain authority is bounded to BPS rebalance via `update_fee_config`,
 *    plus secondary admin operations the IDL exposes (set/transfer admin,
 *    set partner). It CANNOT drain funds, replace claimer pubkeys
 *    (impossible per IDL), force-claim user funds (program-config-admin only),
 *    or call any custodial instruction.
 *  - Keep this distinct from `SOLANA_PAYOUT_KEYPAIR` even though they could
 *    technically share a value. The separation makes the v1.1 cutover and
 *    Phase 6 deletion of the dispatch keypair cleaner, and lets the manager
 *    key live with a tighter rotation schedule than the legacy payout key.
 */
export function managerSigner(): Keypair {
  if (_managerSigner) return _managerSigner;
  const env = serverEnv();
  if (!env.SOLANA_MANAGER_KEYPAIR) {
    throw new Error(
      "SOLANA_MANAGER_KEYPAIR is not configured. Set it (base58-encoded) in Vercel as Sensitive.",
    );
  }
  const decoded = bs58.decode(env.SOLANA_MANAGER_KEYPAIR);
  _managerSigner = Keypair.fromSecretKey(decoded);
  return _managerSigner;
}

export function managerSignerPublicKey(): string | null {
  if (!hasCredentials.managerKey()) return null;
  return managerSigner().publicKey.toBase58();
}
