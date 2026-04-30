"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  PenLine,
  ArrowRight,
} from "lucide-react";
import bs58 from "bs58";
import { Button } from "@repo/ui";
import { Card, CardContent } from "@repo/ui";
import { Badge } from "@repo/ui";
import { WalletConnectButton } from "./WalletConnectButton";
import {
  ApiErrorResponseSchema,
  WalletNonceResponseSchema,
  WalletVerifyResponseSchema,
} from "@repo/shared";

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; address: string }
  | { kind: "error"; reason: string };

/**
 * Build the SIWS message object the server expects (see lib/auth/siws.ts).
 * Field order and casing must match `buildMessage` exactly so the server's
 * recomputed canonical string matches what was signed.
 */
function buildSiwsMessage(args: {
  domain: string;
  address: string;
  uri: string;
  chainId: string;
  nonce: string;
}): {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: "1";
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
} {
  const issuedAt = new Date();
  const expiration = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  return {
    domain: args.domain,
    address: args.address,
    statement: "Sign to link this wallet to your GitShipt account.",
    uri: args.uri,
    version: "1",
    chainId: args.chainId,
    nonce: args.nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiration.toISOString(),
  };
}

/** Same canonical serializer as the server's buildMessage. */
function serializeSiws(m: ReturnType<typeof buildSiwsMessage>): string {
  const lines = [
    `${m.domain} wants you to sign in with your Solana account:`,
    m.address,
    "",
    m.statement,
    "",
    `URI: ${m.uri}`,
    `Version: ${m.version}`,
    `Chain ID: ${m.chainId}`,
    `Nonce: ${m.nonce}`,
    `Issued At: ${m.issuedAt}`,
    `Expiration Time: ${m.expirationTime}`,
  ];
  return lines.join("\n");
}

export function SignInWithSolanaFlow({
  autoRequest = false,
  continueHref = "/dashboard",
  onLinked,
}: {
  autoRequest?: boolean;
  continueHref?: string | null;
  onLinked?: (address: string) => void;
} = {}) {
  const { publicKey, connected, signMessage } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const autoRequestedAddressRef = useRef<string | null>(null);
  const address = publicKey?.toBase58() ?? null;

  const onSign = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setStatus({
        kind: "error",
        reason: "Wallet does not support message signing.",
      });
      return;
    }

    const address = publicKey.toBase58();

    try {
      setStatus({ kind: "signing" });

      // 1. Request a fresh single-use nonce.
      const nonceRes = await fetch("/api/wallets/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) {
        const body = ApiErrorResponseSchema.safeParse(
          await nonceRes.json().catch(() => null),
        );
        throw new Error(
          (body.success ? body.data.error : null) ?? `nonce_${nonceRes.status}`,
        );
      }
      const { nonce } = WalletNonceResponseSchema.parse(await nonceRes.json());

      // 2. Build the SIWS message that matches the server's buildMessage exactly.
      const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
      const message = buildSiwsMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        chainId: `solana:${cluster}`,
        nonce,
      });
      const messageBytes = new TextEncoder().encode(serializeSiws(message));

      // 3. Sign with the wallet.
      const sigBytes = await signMessage(messageBytes);
      const signature = bs58.encode(sigBytes);

      setStatus({ kind: "verifying" });

      // 4. Submit for verification + persistence.
      const verifyRes = await fetch("/api/wallets/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `wallet-link:${address}:${nonce}`,
        },
        credentials: "include",
        body: JSON.stringify({ message, signature }),
      });

      const rawBody = await verifyRes.json().catch(() => null);
      const body = WalletVerifyResponseSchema.safeParse(rawBody);
      if (!verifyRes.ok || !body.success) {
        const errorBody = ApiErrorResponseSchema.safeParse(rawBody);
        const reason = errorBody.success
          ? (errorBody.data.message ?? errorBody.data.error)
          : undefined;
        throw new Error(reason ?? `verify_${verifyRes.status}`);
      }

      const linkedAddress = body.data.address ?? address;
      setStatus({ kind: "success", address: linkedAddress });
      onLinked?.(linkedAddress);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown_error";
      setStatus({ kind: "error", reason });
    }
  }, [onLinked, publicKey, signMessage]);

  useEffect(() => {
    if (!autoRequest || !connected || !publicKey || !address) return;
    if (status.kind !== "idle") return;

    if (autoRequestedAddressRef.current === address) return;
    autoRequestedAddressRef.current = address;
    void onSign();
  }, [address, autoRequest, connected, onSign, publicKey, status.kind]);

  // Disconnected state.
  if (!connected || !publicKey) {
    return (
      <div className="space-y-4">
        <p className="text-body-sm text-fg-secondary">
          Connect a Solana wallet to continue.
        </p>
        <WalletConnectButton />
      </div>
    );
  }

  // Connected — show address pill + action.
  const displayAddress = publicKey.toBase58();
  const isBusy = status.kind === "signing" || status.kind === "verifying";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="info" dot dotColor="info" size="default">
          Wallet connected
        </Badge>
        <WalletConnectButton />
      </div>

      {status.kind === "success" ? (
        <Card depth="raised" padding="default" className="border-success/40">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 size-5 text-success"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="text-label-md text-fg">Wallet linked</p>
                <p className="text-mono-sm text-fg-secondary break-all">
                  {status.address}
                </p>
              </div>
            </div>
            {continueHref ? (
              <Button
                asChild
                variant="primary"
                size="default"
                className="w-full"
              >
                <Link href={continueHref}>
                  Continue to dashboard
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : status.kind === "error" ? (
        <Card depth="raised" padding="default" className="border-danger/40">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 text-danger" aria-hidden />
              <div className="space-y-1">
                <p className="text-label-md text-fg">Could not link wallet</p>
                <p className="text-mono-sm text-danger break-all">
                  {status.reason}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="default"
              onClick={onSign}
              className="w-full"
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={onSign}
          disabled={isBusy}
          aria-busy={isBusy}
          className="w-full"
        >
          {status.kind === "signing" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Awaiting signature…
            </>
          ) : status.kind === "verifying" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Verifying…
            </>
          ) : (
            <>
              <PenLine className="size-4" aria-hidden />
              Sign to link this wallet
            </>
          )}
        </Button>
      )}

      <p className="text-caption text-fg-muted">
        Signing the message proves you control{" "}
        <span className="text-mono-sm text-fg-secondary">
          {displayAddress.slice(0, 4)}…{displayAddress.slice(-4)}
        </span>
        . The signature is single-use and never spends SOL.
      </p>
    </div>
  );
}
