"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { clusterApiUrl, type Cluster } from "@solana/web3.js";

/**
 * Wraps the app in the Solana wallet adapter context.
 *
 * Endpoint resolution:
 *   - Prefers NEXT_PUBLIC_SOLANA_RPC_URL when set (Helius, etc.).
 *   - Falls back to the public clusterApiUrl for the configured cluster.
 *
 * Wallets array is intentionally empty — the wallet-standard auto-discovery
 * built into wallet-adapter-react finds Phantom, Backpack, Solflare, etc.
 * automatically when their browser extensions register on `window`.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (explicit && explicit.length > 0) return explicit;
    const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
      "devnet") as Cluster;
    return clusterApiUrl(cluster);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
