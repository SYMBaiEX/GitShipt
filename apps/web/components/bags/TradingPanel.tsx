"use client";

import * as React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ArrowRightLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@repo/ui";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { formatAddress } from "@repo/lib";
import { clusterLabel, solscanTxUrl } from "@/lib/solana/explorer";

type QuoteResponse = {
  contextSlot: number;
  inAmount: string;
  inputMint: string;
  minOutAmount: string;
  otherAmountThreshold: string;
  outAmount: string;
  outputMint: string;
  priceImpactPct: string;
  routePlan: Array<{ venue: string }>;
  slippageBps: number;
  requestId: string;
  simulatedComputeUnits: number | null;
};

type ProjectQuotePayload = {
  tokenMint: string;
  side: "buy" | "sell";
  quote: QuoteResponse;
  inputDecimals: number;
  outputDecimals: number;
};

type SwapPayload = {
  transactionBase64: string;
  computeUnitLimit: number;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
};

type SimulationPreview = {
  logs: string[];
  slot: number;
  unitsConsumed: number | null;
};

type SimulationFailure = {
  message: string;
  logs: string[];
};

type SwapPreview = {
  feePayer: string | null;
  programIds: string[];
  simulation: SimulationPreview;
  source: string;
  swap: SwapPayload;
  transaction: VersionedTransaction;
  walletAddress: string;
};

type ApiErrorPayload = {
  message?: string;
  error?: string;
};

const DEFAULT_AMOUNT_SOL = "0.10";
const DEFAULT_SLIPPAGE_BPS = 100;

export function TradingPanel({
  projectId,
  symbol,
  tokenMint,
}: {
  projectId: string;
  symbol: string;
  tokenMint: string;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [amount, setAmount] = React.useState(DEFAULT_AMOUNT_SOL);
  const [quote, setQuote] = React.useState<ProjectQuotePayload | null>(null);
  const [swapPreview, setSwapPreview] = React.useState<SwapPreview | null>(
    null,
  );
  const [simulationFailure, setSimulationFailure] =
    React.useState<SimulationFailure | null>(null);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<
    "preview" | "sign" | null
  >(null);
  const [quotePending, startQuoteTransition] = React.useTransition();
  const [swapPending, startSwapTransition] = React.useTransition();

  const amountLamports = React.useMemo(() => solToLamports(amount), [amount]);
  const walletAddress = publicKey?.toBase58() ?? null;
  const canQuote = amountLamports != null && amountLamports > 0;
  const inputSymbol = quote?.side === "sell" ? symbol : "SOL";
  const outputSymbol = quote?.side === "sell" ? "SOL" : symbol;
  const inputLabel = quote
    ? formatAtomicAmount(quote.quote.inAmount, quote.inputDecimals, inputSymbol)
    : null;
  const outputLabel = quote
    ? formatAtomicAmount(
        quote.quote.outAmount,
        quote.outputDecimals,
        outputSymbol,
      )
    : null;
  const minOutputLabel = quote
    ? formatAtomicAmount(
        quote.quote.minOutAmount,
        quote.outputDecimals,
        outputSymbol,
      )
    : null;
  const cluster = clusterLabel();
  const activeSwapPreview =
    swapPreview?.walletAddress === walletAddress ? swapPreview : null;

  function fetchQuote() {
    if (!canQuote || amountLamports == null) {
      setError("Enter a valid SOL amount.");
      return;
    }
    setError(null);
    setSignature(null);
    setSwapPreview(null);
    setSimulationFailure(null);
    startQuoteTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/trading/quote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            side: "buy",
            amount: amountLamports,
            slippageBps: DEFAULT_SLIPPAGE_BPS,
          }),
        });
        const payload = (await res.json().catch(() => null)) as
          | ProjectQuotePayload
          | ApiErrorPayload
          | null;
        if (!res.ok) {
          throw new Error(
            errorMessage(
              payload as ApiErrorPayload | null,
              `Quote failed (${res.status})`,
            ),
          );
        }
        setQuote(payload as ProjectQuotePayload);
      } catch (e) {
        setQuote(null);
        setSwapPreview(null);
        setSimulationFailure(null);
        setError(e instanceof Error ? e.message : "Quote failed.");
      }
    });
  }

  function buildSwapPreview() {
    if (!quote) {
      setError("Refresh the quote first.");
      return;
    }
    if (!connected || !walletAddress) {
      setError("Connect a wallet to sign the swap.");
      return;
    }
    setError(null);
    setSignature(null);
    setSwapPreview(null);
    setSimulationFailure(null);
    setPendingAction("preview");
    startSwapTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/trading/swap`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quoteResponse: quote.quote,
            userPublicKey: walletAddress,
          }),
        });
        const payload = (await res.json().catch(() => null)) as
          | SwapPayload
          | ApiErrorPayload
          | null;
        if (!res.ok) {
          throw new Error(
            errorMessage(
              payload as ApiErrorPayload | null,
              `Swap transaction failed (${res.status})`,
            ),
          );
        }
        const swap = payload as SwapPayload;
        const tx = VersionedTransaction.deserialize(
          base64ToBytes(swap.transactionBase64),
        );
        const simulation = await simulateSwap(tx);
        if ("failure" in simulation) {
          setSimulationFailure(simulation.failure);
          return;
        }
        setSwapPreview({
          feePayer: tx.message.staticAccountKeys[0]?.toBase58() ?? null,
          programIds: extractProgramIds(tx),
          simulation: simulation.preview,
          source: "Bags swap builder",
          swap,
          transaction: tx,
          walletAddress,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Swap preview failed.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function signPreviewedSwap() {
    if (!activeSwapPreview) {
      setError("Preview the swap first.");
      return;
    }
    setError(null);
    setSignature(null);
    setSimulationFailure(null);
    setPendingAction("sign");
    startSwapTransition(async () => {
      try {
        const simulation = await simulateSwap(activeSwapPreview.transaction);
        if ("failure" in simulation) {
          setSimulationFailure(simulation.failure);
          setSwapPreview(null);
          return;
        }
        setSwapPreview({
          ...activeSwapPreview,
          simulation: simulation.preview,
        });
        const sig = await sendTransaction(
          activeSwapPreview.transaction,
          connection,
          {
            maxRetries: 3,
          },
        );
        setSignature(sig);
        setSwapPreview(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Swap failed.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function simulateSwap(
    transaction: VersionedTransaction,
  ): Promise<{ preview: SimulationPreview } | { failure: SimulationFailure }> {
    try {
      const result = await connection.simulateTransaction(transaction, {
        commitment: "processed",
        innerInstructions: false,
        sigVerify: false,
      });
      const logs = result.value.logs ?? [];
      if (result.value.err) {
        return {
          failure: {
            message: `Simulation failed: ${formatSimulationError(
              result.value.err,
            )}`,
            logs,
          },
        };
      }
      return {
        preview: {
          logs,
          slot: result.context.slot,
          unitsConsumed: result.value.unitsConsumed ?? null,
        },
      };
    } catch (e) {
      return {
        failure: {
          message:
            e instanceof Error ? e.message : "Transaction simulation failed.",
          logs: [],
        },
      };
    }
  }

  return (
    <Card depth="raised" padding="default">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2">Trade</CardTitle>
          </div>
          <Badge variant="default" size="sm">
            no KYC
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="mt-4 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="min-w-0">
            <span className="mb-1 block text-label-sm text-fg-secondary">
              Pay
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
                setSwapPreview(null);
                setSimulationFailure(null);
                setSignature(null);
              }}
              leadingIcon={<ArrowRightLeft className="size-4" />}
              trailingIcon={
                <span className="text-mono-sm text-fg-muted">SOL</span>
              }
              aria-invalid={!canQuote}
            />
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={fetchQuote}
              disabled={quotePending || !canQuote}
            >
              {quotePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Quote
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated/50 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <TradeStat
              label="Receive"
              value={outputLabel ?? "--"}
              title={quote?.quote.outAmount}
            />
            <TradeStat
              label="Minimum"
              value={minOutputLabel ?? "--"}
              title={quote?.quote.minOutAmount}
            />
            <TradeStat
              label="Impact"
              value={quote ? `${quote.quote.priceImpactPct}%` : "--"}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span
              className="text-mono-sm text-fg-muted"
              title={quote?.quote.requestId}
            >
              {quote
                ? `slot ${quote.quote.contextSlot.toLocaleString("en-US")}`
                : formatAddress(tokenMint, 6, 6)}
            </span>
            <span className="text-mono-sm text-fg-muted">
              slippage {(DEFAULT_SLIPPAGE_BPS / 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {quote ? (
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-label-sm text-fg">Swap preview</div>
                <div className="text-caption text-fg-muted">
                  {quote.side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}{" "}
                  on {cluster}
                </div>
              </div>
              {activeSwapPreview ? (
                <Badge variant="outline" size="sm">
                  simulated
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <PreviewRow label="Action" value={quote.side.toUpperCase()} />
              {inputLabel ? (
                <PreviewRow label="Input" value={inputLabel} />
              ) : null}
              {outputLabel ? (
                <PreviewRow label="Expected" value={outputLabel} />
              ) : null}
              {minOutputLabel ? (
                <PreviewRow label="Minimum" value={minOutputLabel} />
              ) : null}
              {quote.quote.priceImpactPct ? (
                <PreviewRow
                  label="Impact"
                  value={`${quote.quote.priceImpactPct}%`}
                />
              ) : null}
              <PreviewRow label="Token" value={formatAddress(tokenMint, 6, 6)} />
              {activeSwapPreview?.feePayer ? (
                <PreviewRow
                  label="Fee payer"
                  value={formatAddress(activeSwapPreview.feePayer, 6, 6)}
                  title={activeSwapPreview.feePayer}
                />
              ) : null}
              {activeSwapPreview ? (
                <>
                  <PreviewRow label="Cluster" value={cluster} />
                  <PreviewRow label="Source" value={activeSwapPreview.source} />
                  <PreviewRow
                    label="Last valid"
                    value={activeSwapPreview.swap.lastValidBlockHeight.toLocaleString(
                      "en-US",
                    )}
                  />
                  <PreviewRow
                    label="Compute"
                    value={
                      activeSwapPreview.simulation.unitsConsumed == null
                        ? "passed"
                        : `${activeSwapPreview.simulation.unitsConsumed.toLocaleString(
                            "en-US",
                          )} CU`
                    }
                  />
                </>
              ) : null}
            </div>
            {activeSwapPreview?.programIds.length ? (
              <div className="mt-3 border-t border-border pt-3">
                <div className="text-caption text-fg-muted">Programs</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {activeSwapPreview.programIds.map((programId) => (
                    <span
                      key={programId}
                      className="rounded-sm border border-border bg-surface-elevated px-1.5 py-0.5 text-mono-sm text-fg-secondary"
                      title={programId}
                    >
                      {formatAddress(programId, 4, 4)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {simulationFailure ? (
          <div className="rounded-lg border border-danger bg-danger-soft p-3">
            <div className="text-body-sm text-danger">
              {simulationFailure.message}
            </div>
            {simulationFailure.logs.length ? (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-mono-sm text-fg-secondary">
                {simulationFailure.logs.slice(-6).join("\n")}
              </pre>
            ) : null}
          </div>
        ) : null}

        {connected ? (
          activeSwapPreview ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button
                type="button"
                variant="primary"
                onClick={signPreviewedSwap}
                disabled={swapPending}
              >
                {swapPending && pendingAction === "sign" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="size-4" />
                )}
                Sign swap
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={buildSwapPreview}
                disabled={swapPending}
              >
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={buildSwapPreview}
              disabled={!quote || swapPending}
            >
              {swapPending && pendingAction === "preview" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="size-4" />
              )}
              Preview swap
            </Button>
          )
        ) : (
          <WalletConnectButton />
        )}

        {signature ? (
          <a
            href={solscanTxUrl(signature)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-mono-sm text-success underline-offset-4 hover:underline"
          >
            {formatAddress(signature, 8, 6)}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
        {error ? <p className="text-body-sm text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function PreviewRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-surface-elevated/50 px-2.5 py-2">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-1 truncate text-mono-sm text-fg" title={title ?? value}>
        {value}
      </div>
    </div>
  );
}

function TradeStat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-caption text-fg-muted">{label}</div>
      <div className="mt-1 truncate text-mono-md text-fg" title={title}>
        {value}
      </div>
    </div>
  );
}

function solToLamports(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const [wholeRaw = "0", fractionRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw === "" ? "0" : wholeRaw);
  const fraction = BigInt(fractionRaw.padEnd(9, "0").slice(0, 9) || "0");
  const lamports = whole * 1_000_000_000n + fraction;
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(lamports);
}

function formatAtomicAmount(
  amountRaw: string,
  decimals: number,
  symbol: string,
): string {
  const amount = BigInt(amountRaw);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = amount % scale;
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${
    fractionText ? `.${fractionText}` : ""
  } ${symbol}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function extractProgramIds(transaction: VersionedTransaction): string[] {
  const keys = transaction.message.staticAccountKeys;
  const programIds = new Set<string>();
  for (const instruction of transaction.message.compiledInstructions) {
    const programId = keys[instruction.programIdIndex];
    if (programId) {
      programIds.add(programId.toBase58());
    }
  }
  return Array.from(programIds);
}

function formatSimulationError(err: unknown): string {
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "transaction returned an error";
  }
}

function errorMessage(payload: ApiErrorPayload | null, fallback: string) {
  return payload?.message ?? payload?.error ?? fallback;
}
