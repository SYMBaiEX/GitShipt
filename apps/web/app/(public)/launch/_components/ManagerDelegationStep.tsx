"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, ShieldCheck, X } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Button } from "@repo/ui";
import { cn } from "@repo/lib";
import {
  prepareManagerDelegationAction,
  confirmManagerDelegationAction,
} from "../actions";

export interface ManagerDelegationStepProps {
  projectId: string;
  /** Cluster for explorer links — "mainnet-beta" / "devnet" / "testnet". */
  cluster: string;
  /** Optional callback fired when delegation succeeds. */
  onComplete?: (managerPubkey: string) => void;
  className?: string;
}

type DelegationState =
  | { kind: "preparing" }
  | { kind: "ready"; transactionBase64: string; managerPubkey: string }
  | { kind: "signing"; managerPubkey: string }
  | { kind: "confirming"; managerPubkey: string; txSignature: string }
  | { kind: "complete"; managerPubkey: string; txSignature: string }
  | { kind: "error"; managerPubkey: string | null; message: string };

/**
 * Post-launch step where the project owner delegates the on-chain manager
 * role to GitShipt's keypair via `update_fee_config_manager`.
 *
 * After this step, the cadence cron will start signing BPS rebalances on
 * the configured schedule (24h initial → 3d second → steady-state). The
 * project owner retains the admin role and can revoke the manager at any
 * time by calling update_fee_config_manager again to a different pubkey.
 *
 * Flow:
 *   1. Mount → call prepareManagerDelegationAction → server builds the
 *      unsigned v0 tx + tells us which manager pubkey to expect on-chain.
 *   2. User clicks "Delegate" → sendTransaction via wallet adapter.
 *   3. After the wallet returns a signature → call
 *      confirmManagerDelegationAction → server verifies on-chain that
 *      the manager pubkey landed correctly + records the delegation.
 *
 * Skipping is allowed (the user can leave without signing) — but the
 * cadence cron won't run for their project until the delegation lands.
 * The dashboard shows a "Pending manager delegation" banner in that case
 * (rendered separately, not in this component).
 */
export function ManagerDelegationStep({
  projectId,
  cluster,
  onComplete,
  className,
}: ManagerDelegationStepProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<DelegationState>({ kind: "preparing" });

  // Step 1: fetch the prepared tx on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await prepareManagerDelegationAction(projectId);
      if (cancelled) return;
      if (!result.ok) {
        setState({
          kind: "error",
          managerPubkey: null,
          message: result.message,
        });
        return;
      }
      setState({
        kind: "ready",
        transactionBase64: result.transactionBase64,
        managerPubkey: result.managerPubkey,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleSign = useCallback(async () => {
    if (state.kind !== "ready") return;
    if (!connected || !publicKey) {
      setState({
        kind: "error",
        managerPubkey: state.managerPubkey,
        message: "Connect the launch wallet to sign the delegation.",
      });
      return;
    }
    const managerPubkey = state.managerPubkey;
    setState({ kind: "signing", managerPubkey });

    let txSignature: string;
    try {
      const tx = VersionedTransaction.deserialize(
        Buffer.from(state.transactionBase64, "base64"),
      );
      txSignature = await sendTransaction(tx, connection, { maxRetries: 3 });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Wallet rejected the transaction.";
      setState({ kind: "error", managerPubkey, message });
      return;
    }

    setState({ kind: "confirming", managerPubkey, txSignature });
    const confirmed = await confirmManagerDelegationAction({
      projectId,
      txSignature,
    });
    if (!confirmed.ok) {
      setState({ kind: "error", managerPubkey, message: confirmed.message });
      return;
    }
    setState({
      kind: "complete",
      managerPubkey: confirmed.managerPubkey,
      txSignature,
    });
    onComplete?.(confirmed.managerPubkey);
  }, [
    state,
    connected,
    publicKey,
    sendTransaction,
    connection,
    projectId,
    onComplete,
  ]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border-strong bg-surface p-5 space-y-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent/10 p-2 text-accent">
          <ShieldCheck className="size-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-headline-sm">Delegate manager role to GitShipt</h3>
          <p className="text-body-sm text-fg-secondary">
            One last on-chain step. GitShipt will sign BPS rebalances on
            your configured cadence — but the manager role can&apos;t drain
            funds, replace claimers, or change the partner config. You
            stay the admin and can revoke at any time.
          </p>
        </div>
      </div>

      <div className="rounded-md bg-surface-elevated/40 p-3 space-y-1">
        <p className="text-label-sm text-fg-muted">
          Manager pubkey GitShipt will use
        </p>
        <p className="text-mono-sm break-all text-fg">
          {state.kind === "preparing"
            ? "loading…"
            : state.kind === "error" && !state.managerPubkey
              ? "—"
              : "managerPubkey" in state && state.managerPubkey
                ? state.managerPubkey
                : "—"}
        </p>
      </div>

      <DelegationBody
        state={state}
        cluster={cluster}
        onSign={handleSign}
      />
    </div>
  );
}

function DelegationBody({
  state,
  cluster,
  onSign,
}: {
  state: DelegationState;
  cluster: string;
  onSign: () => void | Promise<void>;
}) {
  switch (state.kind) {
    case "preparing":
      return (
        <div className="flex items-center gap-2 text-body-sm text-fg-secondary">
          <Loader2 className="size-4 animate-spin" />
          Preparing delegation transaction…
        </div>
      );
    case "ready":
      return (
        <Button onClick={() => void onSign()} className="w-full sm:w-auto">
          Sign &amp; broadcast delegation
        </Button>
      );
    case "signing":
      return (
        <div className="flex items-center gap-2 text-body-sm text-fg-secondary">
          <Loader2 className="size-4 animate-spin" />
          Waiting for wallet signature…
        </div>
      );
    case "confirming":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-body-sm text-fg-secondary">
            <Loader2 className="size-4 animate-spin" />
            Confirming on-chain…
          </div>
          <ExplorerLink txSignature={state.txSignature} cluster={cluster} />
        </div>
      );
    case "complete":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-body-sm text-success">
            <Check className="size-4" />
            Manager delegated. Cadence cron will start rebalancing.
          </div>
          <ExplorerLink txSignature={state.txSignature} cluster={cluster} />
        </div>
      );
    case "error":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-body-sm text-error">
            <X className="size-4" />
            {state.message}
          </div>
          <p className="text-body-sm text-fg-secondary">
            You can retry from your project dashboard at any time. Until
            this delegation lands, BPS rebalances are paused for this
            project.
          </p>
        </div>
      );
  }
}

function ExplorerLink({
  txSignature,
  cluster,
}: {
  txSignature: string;
  cluster: string;
}) {
  const url =
    cluster === "mainnet-beta"
      ? `https://explorer.solana.com/tx/${txSignature}`
      : `https://explorer.solana.com/tx/${txSignature}?cluster=${cluster}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-body-sm text-accent hover:underline"
    >
      <span className="text-mono-sm">{shorten(txSignature)}</span>
      <ExternalLink className="size-3.5" />
    </a>
  );
}

function shorten(sig: string): string {
  if (sig.length <= 16) return sig;
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}
