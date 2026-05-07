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
 *  - This keypair holds the on-chain fee-share-v2 MANAGER role per project,
 *    delegated by the project owner (admin) via `update_fee_config_manager`
 *    immediately after launch. The role is structurally bounded by the IDL:
 *    it can call `manager_update_fee_config` (BPS rebalance),
 *    `manager_transfer_fee_config` (rotate to a new manager keypair), and
 *    `manager_waive_fee_config` (return the role to the admin). It CANNOT
 *    drain funds, replace claimer pubkeys, set partner config, reassign
 *    admin, or call any custodial / force-claim instruction.
 *  - Compromise recovery: the project owner (admin) can revoke this manager
 *    via a single `update_fee_config_manager` call to a fresh keypair. The
 *    worst case during the compromise window is BPS manipulation among
 *    existing claimers — never theft. See docs/adr/0001-bags-native-payout.md.
 *  - Keep distinct from `SOLANA_PAYOUT_KEYPAIR` (legacy v1.0; deleted in
 *    Phase 6). The separation lets the manager key live with a tighter
 *    rotation schedule and bounds the v1.1 architecture's blast radius.
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
