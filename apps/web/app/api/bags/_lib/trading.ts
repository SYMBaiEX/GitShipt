import "server-only";
import { Buffer } from "node:buffer";
import { hasCredentials } from "@/lib/env";
import { bags } from "@/lib/bags/client";
import { normalizeBagsTransaction } from "@/lib/bags/transactions";
import {
  ProjectTradeQuoteResponseSchema,
  ProjectTradeSwapResponseSchema,
  TradeQuoteResponseSchema,
  type ProjectTradeQuoteResponse,
  type ProjectTradeSwapResponse,
  type TradeQuoteResponse,
} from "@/lib/bags/types";
export {
  ProjectTradeQuoteRequestSchema,
  ProjectTradeSwapRequestSchema,
} from "@/lib/bags/types";

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export function tradingCredentialsReady():
  { ok: true } | { ok: false; code: string; message: string } {
  if (!hasCredentials.bags()) {
    return {
      ok: false,
      code: "bags_unavailable",
      message: "Bags API key not configured.",
    };
  }
  return { ok: true };
}

export async function getProjectTradeQuote(args: {
  tokenMint: string;
  side: "buy" | "sell";
  amount: number;
  slippageBps: number;
}): Promise<ProjectTradeQuoteResponse> {
  const inputMint = args.side === "buy" ? WRAPPED_SOL_MINT : args.tokenMint;
  const outputMint = args.side === "buy" ? args.tokenMint : WRAPPED_SOL_MINT;
  const quote = TradeQuoteResponseSchema.parse(
    await bags.getTradeQuote({
      inputMint,
      outputMint,
      amount: args.amount,
      slippageMode: "auto",
      slippageBps: args.slippageBps,
    }),
  );
  const firstLeg = quote.routePlan[0];
  const lastLeg = quote.routePlan.at(-1);

  return ProjectTradeQuoteResponseSchema.parse({
    tokenMint: args.tokenMint,
    side: args.side,
    quote,
    inputDecimals:
      firstLeg?.inputMint === inputMint ? firstLeg.inputMintDecimals : 9,
    outputDecimals:
      lastLeg?.outputMint === outputMint ? lastLeg.outputMintDecimals : 9,
  });
}

export async function createProjectSwapTransaction(args: {
  quoteResponse: TradeQuoteResponse;
  userPublicKey: string;
}): Promise<ProjectTradeSwapResponse> {
  const result = await bags.createSwapTransaction({
    quoteResponse: args.quoteResponse,
    userPublicKey: args.userPublicKey,
  });
  const normalized = await normalizeBagsTransaction(result.transaction);
  const transactionBase64 = Buffer.from(
    await serializeUnsignedTransaction(normalized),
  ).toString("base64");

  return ProjectTradeSwapResponseSchema.parse({
    transactionBase64,
    computeUnitLimit: result.computeUnitLimit,
    lastValidBlockHeight: result.lastValidBlockHeight,
    prioritizationFeeLamports: result.prioritizationFeeLamports,
  });
}

async function serializeUnsignedTransaction(
  transaction: Awaited<ReturnType<typeof normalizeBagsTransaction>>,
): Promise<Uint8Array> {
  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  if (transaction instanceof VersionedTransaction) {
    return transaction.serialize();
  }
  if (transaction instanceof Transaction) {
    return transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
  }
  throw new Error("Bags returned an unsupported swap transaction.");
}
