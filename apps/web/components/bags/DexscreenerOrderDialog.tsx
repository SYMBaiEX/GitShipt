"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@repo/ui";
import { DEXSCREENER_PRICE_USDC } from "@repo/shared";

import {
  cancelDexscreenerOrderAction,
  createDexscreenerOrderAction,
  submitDexscreenerPaymentAction,
  type CreateDexscreenerOrderResult,
} from "@/app/dashboard/projects/[id]/dexscreener-actions";

interface Props {
  projectId: string;
  tokenMint: string;
  trigger: React.ReactNode;
}

type Phase = "idle" | "creating" | "signing" | "submitting" | "success" | "error";

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function DexscreenerOrderDialog({
  projectId,
  tokenMint,
  trigger,
}: Props) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [headerImageUrl, setHeaderImageUrl] = React.useState("");
  const [payWithSol, setPayWithSol] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function reset() {
    setPhase("idle");
    setErrorMessage(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!connected || !publicKey) {
      setErrorMessage("Connect your wallet to continue.");
      return;
    }
    if (!headerImageUrl.trim()) {
      setErrorMessage("Header image URL is required.");
      return;
    }
    setErrorMessage(null);
    setPhase("creating");

    let result: CreateDexscreenerOrderResult;
    try {
      result = await createDexscreenerOrderAction({
        projectId,
        payerWallet: publicKey.toBase58(),
        headerImageUrl: headerImageUrl.trim(),
        payWithSol,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order failed.";
      setErrorMessage(message);
      setPhase("error");
      return;
    }

    if (!result.ok) {
      const codeMap: Record<string, string> = {
        already_ordered: "An order already exists for this project.",
        not_launched: "Token must be launched before ordering.",
        not_available: "DexScreener says this token is not available for upgrade.",
      };
      setErrorMessage(codeMap[result.error] ?? result.error);
      setPhase("error");
      return;
    }

    if (result.stub) {
      toast.success("Stub order recorded — DexScreener page upgraded (test mode).");
      setPhase("success");
      router.refresh();
      return;
    }

    // Real path: sign + broadcast the Bags-supplied tx, then finalize.
    setPhase("signing");
    let paymentSignature: string;
    try {
      const tx = VersionedTransaction.deserialize(
        base64ToBytes(result.transactionBase64),
      );
      paymentSignature = await sendTransaction(tx, connection, {
        maxRetries: 3,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallet signing failed.";
      // Release the partial-unique-index slot so the user can immediately
      // retry. Without this the row stays `pending` forever and every
      // subsequent create attempt returns `already_ordered`.
      try {
        await cancelDexscreenerOrderAction({
          orderUuid: result.orderUuid,
          reason: `client_abort: ${message.slice(0, 200)}`,
        });
        router.refresh();
      } catch {
        // Best-effort cleanup; the user can also retry from the dashboard
        // card's "Retry order" affordance which surfaces the failed row.
      }
      setErrorMessage(message);
      setPhase("error");
      return;
    }

    setPhase("submitting");
    try {
      const submit = await submitDexscreenerPaymentAction({
        orderUuid: result.orderUuid,
        paymentSignature,
      });
      if (!submit.ok) {
        setErrorMessage(submit.message ?? submit.error);
        setPhase("error");
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submit failed.";
      setErrorMessage(message);
      setPhase("error");
      return;
    }

    toast.success("DexScreener page upgraded.");
    setPhase("success");
    router.refresh();
  }

  const busy =
    phase === "creating" || phase === "signing" || phase === "submitting";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary-readable" /> Upgrade DexScreener page
          </DialogTitle>
          <DialogDescription>
            Add your token logo, header image, description, and social links to{" "}
            <Link
              href={`https://dexscreener.com/solana/${tokenMint}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary-readable hover:underline inline-flex items-center gap-1"
            >
              dexscreener.com/solana/...
              <ExternalLink className="size-3" />
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dexscreener-header">Header image URL</Label>
            <Input
              id="dexscreener-header"
              type="url"
              placeholder="https://your-cdn.example.com/header.png"
              value={headerImageUrl}
              onChange={(e) => setHeaderImageUrl(e.target.value)}
              disabled={busy}
              required
            />
            <p className="text-caption text-fg-muted">
              Wide banner image shown at the top of your DexScreener token page.
              Recommended 1500×500.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <div className="text-label-md text-fg">Pay with SOL</div>
              <p className="text-caption text-fg-muted">
                Off → pays in USDC at the current price.
              </p>
            </div>
            <input
              type="checkbox"
              checked={payWithSol}
              onChange={(e) => setPayWithSol(e.target.checked)}
              disabled={busy}
              className="size-4"
              aria-label="Pay with SOL"
            />
          </div>

          <div className="rounded-md bg-surface-elevated/40 px-3 py-2.5">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-fg-secondary">Price</span>
              <span className="text-mono-md text-fg">
                ${DEXSCREENER_PRICE_USDC} {payWithSol ? "in SOL" : "USDC"}
              </span>
            </div>
            <p className="mt-1 text-caption text-fg-muted">
              Bags collects the payment. GitShipt does not take a cut.
            </p>
          </div>

          {errorMessage ? (
            <p className="rounded-md bg-danger-soft/50 px-3 py-2 text-body-sm text-danger">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !connected}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {phase === "creating"
                    ? "Creating order..."
                    : phase === "signing"
                      ? "Awaiting signature..."
                      : "Finalizing..."}
                </>
              ) : (
                <>Order upgrade</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
