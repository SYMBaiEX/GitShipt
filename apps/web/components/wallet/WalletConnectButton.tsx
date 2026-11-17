"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Wallet, LogOut, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui";
import { toast } from "sonner";

/**
 * Truncate a base58 pubkey to first 4 + last 4. Mono per design tokens.
 */
function truncate(pk: string): string {
  if (pk.length <= 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/**
 * Minimal Connect / Disconnect control.
 *
 * - Disconnected: opens the wallet picker so the user picks an installed
 *   standard wallet (Phantom, Backpack, Solflare, etc).
 * - Connected: shows the truncated pubkey + a disconnect action.
 *
 * Styled with our Button primitive so it inherits theme tokens. No raw hex.
 */
export function WalletConnectButton() {
  const {
    publicKey,
    connected,
    connecting,
    disconnect,
    select,
    wallets,
    wallet,
    connect,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const address = publicKey?.toBase58();
  const available = wallets.filter(
    ({ readyState }) =>
      readyState === WalletReadyState.Installed ||
      readyState === WalletReadyState.Loadable,
  );

  if (connected && address) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2">
        <span
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface-elevated px-3 text-mono-sm text-fg"
          aria-label={`Connected wallet address: ${address}`}
          title={address}
        >
          <Wallet className="size-4 text-fg-secondary" aria-hidden />
          {truncate(address)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="default"
          onClick={() =>
            void disconnect().catch(() =>
              toast.error("Could not disconnect the wallet."),
            )
          }
          aria-label="Disconnect wallet"
        >
          <LogOut className="size-4" aria-hidden />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={connecting}
          aria-busy={connecting}
        >
          {connecting ? (
            <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
          ) : (
            <Wallet aria-hidden className="size-4" />
          )}
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="pr-10 text-left">
          <DialogTitle>Connect a Solana wallet</DialogTitle>
          <DialogDescription>
            {available.length
              ? "Choose a wallet to connect."
              : "No compatible wallet detected. Enable your wallet extension or open GitShipt in your wallet’s browser."}
          </DialogDescription>
        </DialogHeader>
        {available.length ? (
          <ul className="grid gap-2">
            {available.map(({ adapter }) => (
              <li key={adapter.name}>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full justify-start"
                  onClick={() => {
                    setOpen(false);
                    if (wallet?.adapter.name === adapter.name) {
                      void connect().catch(() =>
                        toast.error("Wallet connection was not completed."),
                      );
                    } else {
                      select(adapter.name);
                    }
                  }}
                >
                  <Wallet aria-hidden className="size-4" /> {adapter.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
