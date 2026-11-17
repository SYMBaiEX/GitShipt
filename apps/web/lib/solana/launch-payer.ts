import "server-only";
import { PublicKey } from "@solana/web3.js";
import { solanaConnection, withRpcRetry } from "./connection";

export class LaunchPayerError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LaunchPayerError";
  }
}

export async function assertLaunchPayerFunded(address: string | null): Promise<void> {
  if (!address) {
    throw new LaunchPayerError(
      "launch_wallet_missing",
      503,
      "GitShipt's setup wallet is not configured.",
    );
  }

  let balance: number;
  try {
    balance = await withRpcRetry(() =>
      solanaConnection("confirmed").getBalance(new PublicKey(address)),
    );
  } catch {
    throw new LaunchPayerError(
      "launch_wallet_balance_unavailable",
      503,
      "Could not verify GitShipt's setup wallet balance. Try again shortly.",
    );
  }
  if (balance === 0) {
    throw new LaunchPayerError(
      "launch_wallet_unfunded",
      503,
      "GitShipt's setup wallet needs SOL before a launch can be prepared. No token metadata was created.",
    );
  }
}
