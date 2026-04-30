import type {
  TokenInfoResponse,
  FeeShareConfigResponse,
  ResolvedWallet,
  ClaimablePositionsResponse,
  LifetimeFees,
  DexscreenerAvailability,
  DexscreenerOrder,
} from "./types";
import {
  DEXSCREENER_PRICE_USDC,
  DEXSCREENER_STUB_TX_SENTINEL,
} from "@repo/shared";

const FAKE_PUBKEY = "GitShipt1111111111111111111111111111111111111";

// Monotonic counter for stub DexScreener orderUUIDs — see
// `dexscreenerOrder()` below for why this is needed instead of Date.now().
let dexscreenerStubSeq = 0;

/**
 * Deterministic fakes used when BAGS_API_KEY is absent. Every response is
 * tagged `__stub: true` so callers can detect dev mode and downstream code
 * (e.g. payout dispatch) can refuse to send real on-chain transfers.
 */
export const stubBags = {
  tokenInfo(symbol: string): TokenInfoResponse {
    const tokenMint = `${symbol.padEnd(4, "X").slice(0, 4)}${FAKE_PUBKEY.slice(4)}`;
    return {
      tokenMint,
      tokenMetadata: `https://stub.gitshipt.local/metadata/${tokenMint}.json`,
      __stub: true,
    };
  },

  feeShareConfig(): FeeShareConfigResponse {
    return {
      configKey: `Cfg${FAKE_PUBKEY.slice(3)}`,
      txSignatures: [],
      feeClaimersTotalBps: 10_000,
      __stub: true,
    };
  },

  resolvedWallet(provider: string, username: string): ResolvedWallet {
    return {
      provider: provider as ResolvedWallet["provider"],
      platformData: {
        id: `stub-${username}`,
        username,
        display_name: username,
        avatar_url: null,
      },
      wallet: FAKE_PUBKEY,
      __stub: true,
    };
  },

  claimablePositions(tokenMint: string): ClaimablePositionsResponse {
    return {
      positions: [
        {
          baseMint: tokenMint,
          totalClaimableLamportsUserShare: 5_000_000_000n, // 5 SOL of "fees"
          virtualPoolClaimableLamportsUserShare: 5_000_000_000n,
          dammPoolClaimableLamportsUserShare: 0n,
          isMigrated: false,
        },
      ],
      __stub: true,
    };
  },

  lifetimeFees(tokenMint: string): LifetimeFees {
    return {
      tokenMint,
      totalLifetimeLamports: 124_500_000_000n,
      totalLifetimeUsd: 21_375.0,
      __stub: true,
    };
  },

  dexscreenerAvailability(): DexscreenerAvailability {
    // In stub mode the upsell is always available so dev / E2E can exercise
    // the full flow against a fresh token without setting up real Bags
    // credentials.
    return { available: true };
  },

  dexscreenerOrder(): DexscreenerOrder {
    // Returns the sentinel transaction string so the client dialog can
    // detect stub mode and skip the wallet-signing leg. The recipient
    // wallet is the same FAKE_PUBKEY used elsewhere in stubs so the row
    // is recognizable in DB inspection.
    //
    // A monotonic counter (rather than Date.now()) prevents collisions
    // when multiple stub orders are created in the same millisecond,
    // which would otherwise trip the `dexscreener_orders_order_uuid_unique`
    // index and make E2E flaky.
    return {
      orderUUID: `stub-ds-${(++dexscreenerStubSeq).toString(36)}`,
      recipientWallet: FAKE_PUBKEY,
      priceUSDC: DEXSCREENER_PRICE_USDC,
      transaction: DEXSCREENER_STUB_TX_SENTINEL,
      lastValidBlockHeight: 1,
    };
  },

  dexscreenerSubmitPayment(orderUUID: string): string {
    // Stable, recognizable signature for stub_paid rows so audit log
    // entries are easy to grep for.
    return `stub-ds-payment-${orderUUID}`;
  },
};
