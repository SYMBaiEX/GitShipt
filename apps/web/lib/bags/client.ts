import {
  serverEnv,
  hasCredentials,
  canLaunchOnBags,
  stubsAllowed,
} from "@/lib/env";
import { payoutSigner } from "@/lib/solana/signer";
import bs58 from "bs58";
import { z } from "zod";
import {
  TokenInfoInputSchema,
  SolanaAddressSchema,
  TokenInfoResponseSchema,
  FeeShareConfigInputSchema,
  FeeShareConfigResponseSchema,
  ResolvedWalletSchema,
  ClaimablePositionsResponseSchema,
  LifetimeFeesSchema,
  LaunchIntentInputSchema,
  TokenCreatorSchema,
  TokenClaimEventSchema,
  TokenClaimStatsSchema,
  TopTokenByLifetimeFeesSchema,
  PoolConfigKeysResponseSchema,
  PartnerConfigSchema,
  PartnerClaimStatsSchema,
  TransactionWithBlockhashSchema,
  TradeQuoteInputSchema,
  TradeQuoteResponseSchema,
  TradeSwapInputSchema,
  TradeSwapTransactionSchema,
  FeeShareAdminTransferInputSchema,
  FeeShareAdminUpdateConfigInputSchema,
  DexscreenerAvailabilitySchema,
  DexscreenerOrderInputSchema,
  DexscreenerOrderSchema,
  IncorporationInputSchema,
  IncorporationPaymentSchema,
  IncorporationProjectSchema,
  StartIncorporationResponseSchema,
  SubmitTransactionResponseSchema,
  LaunchTransactionInputSchema,
  LaunchTransactionResultSchema,
  type TokenInfoInput,
  type TokenInfoResponse,
  type FeeShareConfigInput,
  type FeeShareConfigResponse,
  type ResolvedWallet,
  type ClaimablePositionsResponse,
  type LifetimeFees,
  type LaunchIntentInput,
  type TokenCreator,
  type TokenClaimEvent,
  type TokenClaimStats,
  type TopTokenByLifetimeFees,
  type PoolConfigKeysResponse,
  type PartnerConfig,
  type PartnerClaimStats,
  type TransactionWithBlockhash,
  type TradeQuoteInput,
  type TradeQuoteResponse,
  type TradeSwapInput,
  type TradeSwapTransaction,
  type FeeShareAdminTransferInput,
  type FeeShareAdminUpdateConfigInput,
  type DexscreenerAvailability,
  type DexscreenerOrderInput,
  type DexscreenerOrder,
  type IncorporationInput,
  type IncorporationPayment,
  type IncorporationProject,
  type StartIncorporationResponse,
  type BagsProvider,
  type FeeClaimer,
  type LaunchTransactionResult,
} from "./types";
import { stubBags } from "./__stubs";
import { parseBagsRestEnvelope } from "./rest";
import {
  assertBagsTransactionSafeToSign,
  normalizeBagsTransaction,
  type BagsInstructionPolicy,
  type BagsTransaction,
} from "./transactions";
import { solanaConnection } from "@/lib/solana/connection";
import {
  assertTransactionSimulation,
  digestSimulation,
  type SimulationDigest,
} from "@/lib/solana/simulation";
import { readThroughCache } from "@/lib/read-through-cache";

/**
 * Typed Bags.fm client. Behavior:
 *   - When BAGS_API_KEY is present: instantiates @bagsfm/bags-sdk (lazy,
 *     dynamic import to avoid bundling Solana into RSC payloads) AND falls
 *     back to direct REST calls for endpoints that aren't in the SDK.
 *   - When absent: returns deterministic stubs with `__stub: true`.
 *
 * Every response is Zod-validated before returning to callers — never trust
 * Bags shape across version drift.
 */

type BagsSdk = {
  tokenLaunch: {
    createTokenInfoAndMetadata: (input: {
      name: string;
      symbol: string;
      description: string;
      imageUrl: string;
      website?: string;
      twitter?: string;
      telegram?: string;
    }) => Promise<{
      tokenMint: string;
      tokenMetadata: string;
    }>;
    createLaunchTransaction: (input: {
      metadataUrl: string;
      tokenMint: unknown;
      launchWallet: unknown;
      initialBuyLamports: number;
      configKey: unknown;
    }) => Promise<unknown>;
  };
  state: {
    getConnection: () => unknown;
    getTokenLifetimeFees: (tokenMint: unknown) => Promise<number>;
    getLaunchWalletV2Bulk: (
      items: Array<{ username: string; provider: BagsProvider }>,
    ) => Promise<
      Array<{
        username: string;
        provider: string;
        wallet: unknown | null;
        platformData: unknown | null;
      }>
    >;
    getTokenCreators: (tokenMint: unknown) => Promise<unknown[]>;
    getTopTokensByLifetimeFees: () => Promise<unknown[]>;
    getPoolConfigKeysByFeeClaimerVaults: (
      feeClaimerVaults: unknown[],
    ) => Promise<unknown[]>;
    getTokenClaimStats: (tokenMint: unknown) => Promise<unknown[]>;
    getTokenClaimEvents: (
      tokenMint: unknown,
      options?: { limit?: number; offset?: number },
    ) => Promise<unknown[]>;
  };
  config: {
    createBagsFeeShareConfig: (input: {
      payer: unknown;
      baseMint: unknown;
      feeClaimers: Array<{ user: unknown; userBps: number }>;
      partner?: unknown;
      partnerConfig?: unknown;
      bagsConfigType?: string;
    }) => Promise<{
      transactions?: unknown[];
      bundles?: unknown[][];
      meteoraConfigKey: unknown;
    }>;
  };
  fee: {
    getAllClaimablePositions: (wallet: unknown) => Promise<unknown[]>;
    getClaimTransactions: (
      wallet: unknown,
      mint: unknown,
    ) => Promise<unknown[]>;
  };
  partner: {
    getPartnerConfig: (wallet: unknown) => Promise<unknown>;
    getPartnerConfigCreationTransaction: (
      partner: unknown,
    ) => Promise<{ transaction: unknown; blockhash: unknown }>;
    getPartnerConfigClaimStats: (partner: unknown) => Promise<unknown>;
    getPartnerConfigClaimTransactions: (
      partner: unknown,
    ) => Promise<Array<{ transaction: unknown; blockhash: unknown }>>;
  };
  trade: {
    getQuote: (params: {
      inputMint: unknown;
      outputMint: unknown;
      amount: number;
      slippageMode?: "manual" | "auto";
      slippageBps?: number;
    }) => Promise<unknown>;
    createSwapTransaction: (params: {
      quoteResponse: TradeQuoteResponse;
      userPublicKey: unknown;
    }) => Promise<unknown>;
  };
  feeShareAdmin: {
    getAdminTokenMints: (wallet: unknown) => Promise<string[]>;
    getTransferAdminTransaction: (params: {
      baseMint: unknown;
      currentAdmin: unknown;
      newAdmin: unknown;
      payer: unknown;
    }) => Promise<{ transaction: unknown; blockhash: unknown }>;
    getUpdateConfigTransactions: (params: {
      baseMint: unknown;
      payer: unknown;
      feeClaimers: Array<{ user: unknown; userBps: number }>;
      additionalLookupTables?: unknown[];
    }) => Promise<Array<{ transaction: unknown; blockhash: unknown }>>;
  };
  dexscreener: {
    checkOrderAvailability: (params: {
      tokenAddress: unknown;
    }) => Promise<unknown>;
    createOrder: (params: {
      tokenAddress: unknown;
      description: string;
      iconImageUrl: string;
      headerImageUrl: string;
      payerWallet: unknown;
      links?: Array<{ url: string; label?: string }>;
      payWithSol?: boolean;
    }) => Promise<unknown>;
    submitPayment: (params: {
      orderUUID: string;
      paymentSignature: string;
    }) => Promise<string>;
  };
  incorporation: {
    startPayment: (input: {
      payerWallet: unknown;
      payWithSol?: boolean;
    }) => Promise<unknown>;
    incorporate: (input: {
      orderUUID: string;
      paymentSignature: string;
      projectName: string;
      tokenAddress: unknown;
      founders: Array<{
        firstName: string;
        lastName: string;
        email: string;
        nationalityCountry: string;
        taxResidencyCountry: string;
        residentialAddress: string;
        shareBasisPoint: number;
      }>;
      incorporationShareBasisPoint: number;
      preferredCompanyNames: string[];
      category?: string;
      twitterHandle?: string;
    }) => Promise<unknown>;
    getDetails: (input: { tokenAddress: unknown }) => Promise<unknown>;
    list: () => Promise<unknown[]>;
    startIncorporation: (input: { tokenAddress: unknown }) => Promise<unknown>;
  };
};

type BagsSdkModule = {
  BagsSDK: new (
    apiKey: string,
    connection: unknown,
    commitment: "processed",
  ) => BagsSdk;
};

let _sdk: BagsSdk | null = null;
let _sdkModule: BagsSdkModule | null = null;

const DEMO_TOKEN_MINT = "GShiptDemoMint111111111111111111111111111111";
const STUB_TOKEN_SUFFIX = "ags1111111111111111111111111111111111111";

function isPlaceholderTokenMint(tokenMint: string): boolean {
  return tokenMint === DEMO_TOKEN_MINT || tokenMint.endsWith(STUB_TOKEN_SUFFIX);
}

function bagsReadCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  return readThroughCache({
    key: `bags:${key}`,
    ttlSeconds,
    loader,
    allowStaleOnError: true,
  });
}

function bagsFmUrl(path = ""): string {
  return new URL(path, "https://bags.fm/").toString();
}

async function getSdk(): Promise<BagsSdk> {
  if (_sdk) return _sdk;
  const env = serverEnv();
  if (!env.BAGS_API_KEY) {
    throw new Error("BAGS_API_KEY is required for live Bags calls.");
  }
  if (!env.HELIUS_RPC_URL) {
    throw new Error("HELIUS_RPC_URL is required for Bags SDK.");
  }
  const [sdkModule, { Connection }] = await Promise.all([
    import("@bagsfm/bags-sdk"),
    import("@solana/web3.js"),
  ]);
  _sdkModule = sdkModule as unknown as BagsSdkModule;
  const conn = new Connection(env.HELIUS_RPC_URL, "processed");
  _sdk = new _sdkModule.BagsSDK(env.BAGS_API_KEY, conn, "processed");
  return _sdk;
}

async function tryGetSdk(): Promise<BagsSdk | null> {
  try {
    return await getSdk();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("HELIUS_RPC_URL is required")
    ) {
      return null;
    }
    throw error;
  }
}

function shouldUseStubLaunch(): boolean {
  const shouldStub = !hasCredentials.bags() || !canLaunchOnBags().ok;
  if (shouldStub && !stubsAllowed()) {
    const guard = canLaunchOnBags();
    throw new Error(
      `Live Bags credentials are required in production: ${
        guard.ok ? "BAGS_API_KEY missing" : guard.reason
      }`,
    );
  }
  return shouldStub;
}

function publicKeyToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "toBase58" in value &&
    typeof value.toBase58 === "function"
  ) {
    return value.toBase58();
  }
  return String(value);
}

function normalizePublicKeyFields(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    out[key] =
      field &&
      typeof field === "object" &&
      "toBase58" in field &&
      typeof field.toBase58 === "function"
        ? field.toBase58()
        : field;
  }
  return out;
}

function addFeeClaimer(
  claimers: Map<string, number>,
  wallet: string,
  bps: number,
): void {
  if (bps <= 0) return;
  claimers.set(wallet, (claimers.get(wallet) ?? 0) + bps);
}

function isSocialClaimer(
  claimer: FeeClaimer,
): claimer is Extract<FeeClaimer, { provider: BagsProvider }> {
  return "provider" in claimer;
}

function resolvePlatformFeeWallet(
  input: FeeShareConfigInput,
  env: ReturnType<typeof serverEnv>,
): string | null {
  if (input.shareFee <= 0) return null;
  const wallet = input.platformFeeWallet ?? env.SOLANA_TREASURY_ADDRESS;
  if (!wallet) {
    throw new Error(
      "SOLANA_TREASURY_ADDRESS is required when platformFeeBps is greater than 0.",
    );
  }
  if (wallet === input.payer) {
    throw new Error(
      "SOLANA_TREASURY_ADDRESS must be distinct from the payout wallet when platformFeeBps is greater than 0.",
    );
  }
  return wallet;
}

function resolveRequiredPartnerPair(
  input: FeeShareConfigInput,
  env: ReturnType<typeof serverEnv>,
): { partnerWallet?: string; partnerConfigKey?: string } {
  const partnerWallet = input.partner ?? env.BAGS_PARTNER_WALLET;
  const partnerConfigKey = input.partnerConfig ?? env.BAGS_PARTNER_CONFIG_KEY;

  if (partnerWallet && !partnerConfigKey) {
    throw new Error(
      "BAGS_PARTNER_CONFIG_KEY is required when BAGS_PARTNER_WALLET is configured.",
    );
  }
  if (!partnerWallet && partnerConfigKey) {
    throw new Error(
      "BAGS_PARTNER_WALLET is required when BAGS_PARTNER_CONFIG_KEY is configured.",
    );
  }

  return { partnerWallet, partnerConfigKey };
}

function extractSubmittedSignature(raw: unknown): string {
  const parsed = SubmitTransactionResponseSchema.parse(raw);
  return typeof parsed === "string" ? parsed : parsed.response;
}

async function signAndSubmitViaBags(
  transaction: unknown,
  options?: {
    operation?: string;
    allowSignerSystemTransfer?: boolean;
    bagsInstructionPolicy?: BagsInstructionPolicy;
    /**
     * Optional hook invoked with the bounded SimulationDigest right before
     * the transaction is broadcast. Use this in money-flow paths to persist
     * the evidence on the corresponding row (e.g. payouts.last_claim_simulation).
     * Errors thrown from the hook do not abort the broadcast — they only
     * surface as captured exceptions on the observability sink, since the
     * simulation itself has already passed.
     */
    onSimulation?: (digest: SimulationDigest) => void | Promise<void>;
  },
): Promise<string> {
  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  const signer = payoutSigner();
  const normalized = await normalizeBagsTransaction(transaction);
  const operation = options?.operation ?? "Bags transaction";

  await assertBagsTransactionSafeToSign(normalized, signer.publicKey, {
    operation,
    allowSignerSystemTransfer: options?.allowSignerSystemTransfer,
    bagsInstructionPolicy: options?.bagsInstructionPolicy,
  });

  let serialized: Uint8Array | Buffer;
  if (normalized instanceof VersionedTransaction) {
    normalized.sign([signer]);
    serialized = normalized.serialize();
  } else if (normalized instanceof Transaction) {
    normalized.sign(signer);
    serialized = normalized.serialize();
  } else {
    throw new Error("Bags returned an unsupported transaction type.");
  }

  const evidence = await assertTransactionSimulation(
    solanaConnection("processed"),
    normalized,
    operation,
  );
  if (options?.onSimulation) {
    try {
      await options.onSimulation(digestSimulation(evidence));
    } catch (err) {
      // Persistence is best-effort; the simulation already passed and the
      // broadcast will proceed. Capture so we notice silent persistence
      // failures.
      const { captureException } = await import("@/lib/observability");
      captureException(err, {
        area: "bags.signAndSubmit.onSimulation",
        severity: "warning",
        tags: { operation },
      });
    }
  }

  const raw = await bagsRestRaw("solana/send-transaction", {
    method: "POST",
    body: JSON.stringify({ transaction: bs58.encode(serialized) }),
  });
  return extractSubmittedSignature(raw);
}

function readHeaderCaseInsensitive(
  headers: Headers | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  const direct = headers.get(target);
  if (direct !== null) return direct;
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
}

function parseResetTimeFromBody(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "resetTime" in parsed &&
      typeof (parsed as { resetTime: unknown }).resetTime === "number"
    ) {
      return (parsed as { resetTime: number }).resetTime;
    }
  } catch {
    // Not JSON, fall through.
  }
  return null;
}

async function bagsRestRaw(
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<unknown> {
  const env = serverEnv();
  if (!env.BAGS_API_KEY) {
    throw new Error("BAGS_API_KEY is required for REST calls.");
  }
  const url = new URL(path, env.BAGS_API_BASE_URL);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }

  let retryCount = 0;
  const maxRetries = 1;

  for (;;) {
    const res = await fetch(url, {
      ...init,
      headers: {
        "x-api-key": env.BAGS_API_KEY,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const remainingHeader = readHeaderCaseInsensitive(
      res.headers,
      "X-RateLimit-Remaining",
    );
    if (remainingHeader !== null) {
      const remaining = Number(remainingHeader);
      if (Number.isFinite(remaining) && remaining < 50) {
        console.warn(
          `Bags API rate limit low: ${remaining} requests remaining (path=${path}).`,
        );
      }
    }

    if (res.status === 429) {
      const body = await res.text();
      const resetFromBody = parseResetTimeFromBody(body);
      const resetHeader = readHeaderCaseInsensitive(
        res.headers,
        "X-RateLimit-Reset",
      );
      const resetFromHeader =
        resetHeader !== null && Number.isFinite(Number(resetHeader))
          ? Number(resetHeader)
          : null;
      const resetTime =
        resetFromBody ?? resetFromHeader ?? Math.floor(Date.now() / 1000) + 1;

      if (retryCount >= maxRetries) {
        throw new Error(
          `Bags API rate limit exhausted; resets at ${new Date(
            resetTime * 1000,
          ).toISOString()}`,
        );
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const waitMs = Math.max(
        1000,
        Math.min(60_000, (resetTime - nowSec) * 1000),
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      retryCount += 1;
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Bags ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
      );
    }
    return await res.json();
  }
}

async function bagsRest<TSchema extends z.ZodType>(
  path: string,
  responseSchema: TSchema,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<z.infer<TSchema>> {
  return parseBagsRestEnvelope(await bagsRestRaw(path, init), responseSchema);
}

const AuthMeSchema = z.object({
  user: z
    .object({
      uuid: z.string(),
      type: z.string().optional(),
      ticker: z.string().optional(),
      username: z.string().optional(),
      status: z.string().optional(),
      pref_name: z.string().optional(),
      picture: z.string().optional(),
      points: z.number().optional(),
      rank: z.number().optional(),
      referral_count: z.number().optional(),
    })
    .loose(),
});
type AuthMe = z.infer<typeof AuthMeSchema>;

const ClaimEventSchema = z.object({
  wallet: z.string(),
  isCreator: z.boolean(),
  amount: z.coerce.bigint(),
  signature: z.string(),
  timestamp: z.string(),
});
const ClaimEventsSchema = z.object({
  events: z.array(ClaimEventSchema),
});
type ClaimEvents = z.infer<typeof ClaimEventsSchema>;

const PoolByMintSchema = z.object({
  tokenMint: z.string(),
  dbcConfigKey: z.string(),
  dbcPoolKey: z.string(),
  dammV2PoolKey: z.string().nullable(),
});
type PoolByMint = z.infer<typeof PoolByMintSchema>;

const LaunchFeedItemSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  tokenMint: z.string(),
  status: z.enum(["PRE_LAUNCH", "PRE_GRAD", "MIGRATING", "MIGRATED"]),
  twitter: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  launchSignature: z.string().nullable().optional(),
  accountKeys: z.array(z.string()).optional(),
  numRequiredSigners: z.number().nullable().optional(),
  uri: z.string().nullable().optional(),
  dbcPoolKey: z.string().nullable().optional(),
  dbcConfigKey: z.string().nullable().optional(),
});
const LaunchFeedSchema = z.array(LaunchFeedItemSchema);
type LaunchFeed = z.infer<typeof LaunchFeedSchema>;

/**
 * Local stub additions for the new methods in this file. Lives here (not in
 * `./__stubs.ts`) because Wave 1 of this change set scopes additions to
 * `client.ts` only — Wave 2 may relocate these alongside the canonical
 * `stubBags` once consumers land. Names mirror the pattern in `__stubs.ts`.
 */
const localBagsStubs = {
  claimEvents: (mint: string): ClaimEvents => {
    void mint;
    return { events: [] };
  },
  poolByMint: (mint: string): PoolByMint => ({
    tokenMint: mint,
    dbcConfigKey: "STUB" + "1".repeat(40),
    dbcPoolKey: "STUB" + "2".repeat(40),
    dammV2PoolKey: null,
  }),
  launchFeed: (): LaunchFeed => [],
};

export const bags = {
  hasCredentials: hasCredentials.bags,

  /**
   * Identify the API key holder via the public REST `auth/me` endpoint. No
   * SDK alternative — REST-only. Idempotent GET.
   */
  async authMe(): Promise<AuthMe> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY required for authMe.");
    }
    return bagsRest("auth/me", AuthMeSchema);
  },

  /** Step 1 of launch: upload metadata, get tokenMint + metadata URL. */
  async createTokenInfo(input: TokenInfoInput): Promise<TokenInfoResponse> {
    const validated = TokenInfoInputSchema.parse(input);
    if (shouldUseStubLaunch()) {
      return TokenInfoResponseSchema.parse(
        stubBags.tokenInfo(validated.symbol),
      );
    }
    const sdk = await getSdk();
    const raw = await sdk.tokenLaunch.createTokenInfoAndMetadata({
      ...validated,
      description: validated.description ?? "",
    });
    return TokenInfoResponseSchema.parse(raw);
  },

  /** Step 2 of launch: register fee-share config using Bags Fee Share v2. */
  async createFeeShareConfig(
    input: FeeShareConfigInput,
  ): Promise<FeeShareConfigResponse> {
    const validated = FeeShareConfigInputSchema.parse(input);
    if (shouldUseStubLaunch()) {
      return FeeShareConfigResponseSchema.parse(stubBags.feeShareConfig());
    }
    const env = serverEnv();
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);

    const socialClaimers = validated.feeClaimers.filter(isSocialClaimer);
    const resolved =
      socialClaimers.length > 0
        ? await sdk.state.getLaunchWalletV2Bulk(
            socialClaimers.map(({ provider, username }) => ({
              provider,
              username,
            })),
          )
        : [];
    const resolvedByKey = new Map(
      resolved.map((wallet) => [
        `${wallet.provider}:${wallet.username}`.toLowerCase(),
        wallet,
      ]),
    );

    const claimerBpsByWallet = new Map<string, number>();
    for (const claimer of validated.feeClaimers) {
      if (!isSocialClaimer(claimer)) {
        addFeeClaimer(claimerBpsByWallet, claimer.wallet, claimer.bps);
        continue;
      }
      const resolvedWallet = resolvedByKey.get(
        `${claimer.provider}:${claimer.username}`.toLowerCase(),
      );
      if (!resolvedWallet?.wallet) {
        throw new Error(
          `Bags wallet not found for ${claimer.provider}:${claimer.username}`,
        );
      }
      addFeeClaimer(
        claimerBpsByWallet,
        publicKeyToString(resolvedWallet.wallet),
        claimer.bps,
      );
    }

    const platformFeeWallet = resolvePlatformFeeWallet(validated, env);
    if (platformFeeWallet) {
      if (claimerBpsByWallet.has(platformFeeWallet)) {
        throw new Error(
          "SOLANA_TREASURY_ADDRESS must be distinct from contributor pool fee claimers.",
        );
      }
      addFeeClaimer(claimerBpsByWallet, platformFeeWallet, validated.shareFee);
    }

    const feeClaimers = Array.from(claimerBpsByWallet, ([wallet, bps]) => ({
      user: new PublicKey(wallet),
      userBps: bps,
    }));
    const totalBps = feeClaimers.reduce(
      (sum, claimer) => sum + claimer.userBps,
      0,
    );
    if (totalBps !== 10_000) {
      throw new Error(
        `Bags fee claimers must total 10000 bps; got ${totalBps}.`,
      );
    }

    const { partnerWallet, partnerConfigKey } = resolveRequiredPartnerPair(
      validated,
      env,
    );
    const payer = new PublicKey(validated.payer);
    const result = await sdk.config.createBagsFeeShareConfig({
      payer,
      baseMint: new PublicKey(validated.baseMint),
      feeClaimers,
      partner: partnerWallet ? new PublicKey(partnerWallet) : undefined,
      partnerConfig: partnerConfigKey
        ? new PublicKey(partnerConfigKey)
        : undefined,
      bagsConfigType: validated.bagsConfigType ?? env.BAGS_CONFIG_TYPE,
    });

    const signer = payoutSigner();
    if (!signer.publicKey.equals(payer)) {
      throw new Error(
        "SOLANA_PAYOUT_KEYPAIR must match the fee-share payer wallet.",
      );
    }

    const txSignatures: string[] = [];
    for (const bundle of result.bundles ?? []) {
      for (const tx of bundle) {
        txSignatures.push(
          await signAndSubmitViaBags(tx, {
            operation: "Bags fee-share config transaction",
            bagsInstructionPolicy: "fee-config",
          }),
        );
      }
    }
    for (const tx of result.transactions ?? []) {
      txSignatures.push(
        await signAndSubmitViaBags(tx, {
          operation: "Bags fee-share config transaction",
          bagsInstructionPolicy: "fee-config",
        }),
      );
    }

    return FeeShareConfigResponseSchema.parse({
      configKey: publicKeyToString(result.meteoraConfigKey),
      txSignatures,
      feeClaimersTotalBps: totalBps,
      partnerWallet,
      partnerConfigKey,
      poolClaimerWallet:
        validated.feeClaimers.length === 1
          ? Array.from(claimerBpsByWallet.keys())[0]
          : undefined,
    });
  },

  async createAndSubmitLaunchTransaction(args: {
    tokenMint: string;
    metadataUrl: string;
    configKey: string;
    launchWallet: string;
    initialBuyLamports?: number;
  }): Promise<LaunchTransactionResult> {
    const validated = LaunchTransactionInputSchema.parse(args);
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);
    const tx = await sdk.tokenLaunch.createLaunchTransaction({
      metadataUrl: validated.metadataUrl,
      tokenMint: new PublicKey(validated.tokenMint),
      configKey: new PublicKey(validated.configKey),
      launchWallet: new PublicKey(validated.launchWallet),
      initialBuyLamports: validated.initialBuyLamports,
    });
    return LaunchTransactionResultSchema.parse({
      signature: await signAndSubmitViaBags(tx, {
        operation: "Bags launch transaction",
        allowSignerSystemTransfer: true,
      }),
    });
  },

  /**
   * Resolve `provider` + `username` to a Bags-routed wallet address.
   * Used at launch (to know the platform-pool address) and during onboarding
   * (to validate that a fee claimer can be configured for a contributor).
   */
  async resolveWallet(
    provider: BagsProvider,
    username: string,
  ): Promise<ResolvedWallet> {
    if (!hasCredentials.bags()) {
      return ResolvedWalletSchema.parse(
        stubBags.resolvedWallet(provider, username),
      );
    }
    return bagsRest(
      "token-launch/fee-share/wallet/v2",
      ResolvedWalletSchema,
      { query: { provider, username } },
    );
  },

  /** Read claimable lamports per token-mint position for a given wallet. */
  async getClaimablePositions(
    walletAddress: string,
  ): Promise<ClaimablePositionsResponse> {
    if (!hasCredentials.bags()) {
      return ClaimablePositionsResponseSchema.parse(
        stubBags.claimablePositions(
          "StubMint11111111111111111111111111111111111",
        ),
      );
    }
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const positions = sdk
      ? await sdk.fee.getAllClaimablePositions(new PublicKey(walletAddress))
      : await bagsRest("token-launch/claimable-positions", z.array(z.unknown()), {
          query: { wallet: walletAddress },
        });
    return ClaimablePositionsResponseSchema.parse({ positions });
  },

  /** Aggregate lifetime fee total for a token. Used on the project page. */
  async getLifetimeFees(tokenMint: string): Promise<LifetimeFees> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) {
      return LifetimeFeesSchema.parse(stubBags.lifetimeFees(tokenMint));
    }
    return bagsReadCache(`lifetime-fees:${tokenMint}`, 60, async () => {
      const { PublicKey } = await import("@solana/web3.js");
      const sdk = await tryGetSdk();
      const totalLifetimeLamports = sdk
        ? await sdk.state.getTokenLifetimeFees(new PublicKey(tokenMint))
        : await bagsRest("token-launch/lifetime-fees", z.coerce.bigint(), {
            query: { tokenMint },
          });
      return LifetimeFeesSchema.parse({
        tokenMint,
        totalLifetimeLamports,
      });
    });
  },

  /**
   * Get an array of unsigned web3 transactions to claim accrued fees on
   * behalf of `walletAddress` for `tokenMint`. Caller signs + sends.
   * Throws when stubbed — payout dispatch must be guarded.
   */
  async getClaimTransactions(
    walletAddress: string,
    tokenMint: string,
  ): Promise<{ transactions: BagsTransaction[]; __stub?: boolean }> {
    if (!hasCredentials.bags()) {
      return { transactions: [], __stub: true };
    }
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const transactions = sdk
      ? await sdk.fee.getClaimTransactions(
          new PublicKey(walletAddress),
          new PublicKey(tokenMint),
        )
      : await bagsRest(
          "token-launch/claim-txs/v3",
          z.array(z.object({ tx: z.unknown() }).loose()),
          {
            method: "POST",
            body: JSON.stringify({
              feeClaimer: walletAddress,
              tokenMint,
            }),
          },
        );
    return {
      transactions: await Promise.all(
        transactions.map((tx) => normalizeBagsTransaction(tx)),
      ),
    };
  },

  async signAndSubmitTransaction(
    transaction: unknown,
    options?: {
      operation?: string;
      allowSignerSystemTransfer?: boolean;
      bagsInstructionPolicy?: BagsInstructionPolicy;
      onSimulation?: (digest: SimulationDigest) => void | Promise<void>;
    },
  ): Promise<string> {
    return signAndSubmitViaBags(transaction, options);
  },

  /** Build a Bags-hosted launch intent URL for user-signed handoff flows. */
  createLaunchIntentUrl(input: LaunchIntentInput): string {
    const env = serverEnv();
    const validated = LaunchIntentInputSchema.parse(input);
    const url = new URL("launch", "https://bags.fm/");
    url.searchParams.set("intent", "true");
    url.searchParams.set("ref", validated.refCode ?? env.BAGS_REF_CODE);
    if (validated.name) url.searchParams.set("name", validated.name);
    if (validated.symbol) url.searchParams.set("ticker", validated.symbol);
    if (validated.description) {
      url.searchParams.set("description", validated.description);
    }
    if (validated.imageUrl) url.searchParams.set("image", validated.imageUrl);
    if (validated.website) url.searchParams.set("website", validated.website);
    if (validated.twitter) url.searchParams.set("twitter", validated.twitter);
    if (validated.telegram) {
      url.searchParams.set("telegram", validated.telegram);
    }
    if (validated.feeShareBps !== undefined) {
      url.searchParams.set("feeShareBps", String(validated.feeShareBps));
    }
    if (validated.adminWallet) {
      url.searchParams.set("adminWallet", validated.adminWallet);
    }
    const partnerWallet = validated.partner ?? env.BAGS_PARTNER_WALLET;
    const partnerConfigKey =
      validated.partnerConfig ?? env.BAGS_PARTNER_CONFIG_KEY;
    if (partnerWallet && partnerConfigKey) {
      url.searchParams.set("partner", partnerWallet);
      url.searchParams.set("partnerConfig", partnerConfigKey);
    }
    if (validated.tokenizeEquity !== undefined) {
      url.searchParams.set(
        "tokenizeEquity",
        validated.tokenizeEquity ? "true" : "false",
      );
    }
    return url.toString();
  },

  bagsTokenUrl(tokenMint: string): string {
    return bagsFmUrl(tokenMint);
  },

  async getTokenCreators(tokenMint: string): Promise<TokenCreator[]> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) return [];
    return bagsReadCache(`token-creators:${tokenMint}`, 300, async () => {
      const [{ PublicKey }, sdk] = await Promise.all([
        import("@solana/web3.js"),
        getSdk(),
      ]);
      const creators = await sdk.state.getTokenCreators(
        new PublicKey(tokenMint),
      );
      return creators.map((creator) =>
        TokenCreatorSchema.parse(normalizePublicKeyFields(creator)),
      );
    });
  },

  /**
   * Time-windowed fee-share claim events for a token. Inclusive `[from, to]`
   * Unix seconds. No pagination — Bags caps at ~100 events upstream.
   */
  async getClaimEventsByTime(
    tokenMint: string,
    fromUnix: number,
    toUnix: number,
  ): Promise<ClaimEvents> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) {
      return ClaimEventsSchema.parse(localBagsStubs.claimEvents(tokenMint));
    }
    if (!Number.isInteger(fromUnix) || !Number.isInteger(toUnix)) {
      throw new Error("fromUnix and toUnix must be integer Unix-second values.");
    }
    if (toUnix < fromUnix) {
      throw new Error("toUnix must be >= fromUnix.");
    }
    return bagsReadCache(
      `claim-events-by-time:${tokenMint}:${fromUnix}:${toUnix}`,
      60,
      () =>
        bagsRest("fee-share/token/claim-events", ClaimEventsSchema, {
          query: {
            tokenMint,
            mode: "time",
            from: String(fromUnix),
            to: String(toUnix),
          },
        }),
    );
  },

  async getTokenClaimEvents(
    tokenMint: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TokenClaimEvent[]> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) return [];
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    return bagsReadCache(
      `token-claim-events:${tokenMint}:${limit}:${offset}`,
      60,
      async () => {
        const [{ PublicKey }, sdk] = await Promise.all([
          import("@solana/web3.js"),
          getSdk(),
        ]);
        const events = await sdk.state.getTokenClaimEvents(
          new PublicKey(tokenMint),
          options,
        );
        return events.map((event) =>
          TokenClaimEventSchema.parse(normalizePublicKeyFields(event)),
        );
      },
    );
  },

  async getTokenClaimStats(tokenMint: string): Promise<TokenClaimStats[]> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) return [];
    return bagsReadCache(`token-claim-stats:${tokenMint}`, 60, async () => {
      const { PublicKey } = await import("@solana/web3.js");
      const sdk = await tryGetSdk();
      const statsResponse = sdk
        ? await sdk.state.getTokenClaimStats(new PublicKey(tokenMint))
        : await bagsRest(
            "token-launch/claim-stats",
            z.union([
              z.array(z.unknown()),
              z.object({
                success: z.literal(true),
                response: z.array(z.unknown()),
              }),
            ]),
            { query: { tokenMint } },
          );
      const stats = Array.isArray(statsResponse)
        ? statsResponse
        : statsResponse.response;
      return stats.map((stat) =>
        TokenClaimStatsSchema.parse(normalizePublicKeyFields(stat)),
      );
    });
  },

  async getTopTokensByLifetimeFees(): Promise<TopTokenByLifetimeFees[]> {
    if (!hasCredentials.bags()) return [];
    return bagsReadCache("top-tokens-by-lifetime-fees", 120, async () => {
      const sdk = await tryGetSdk();
      if (!sdk) {
        throw new Error(
          "Top-tokens lookup requires the Bags SDK; no REST equivalent exists in the public API.",
        );
      }
      const tokens = await sdk.state.getTopTokensByLifetimeFees();
      return tokens.map((token) => TopTokenByLifetimeFeesSchema.parse(token));
    });
  },

  /**
   * Full token launch feed via REST. No filters or pagination upstream — the
   * caller is expected to join against our DB and paginate client-side.
   */
  async getLaunchFeed(): Promise<LaunchFeed> {
    if (!hasCredentials.bags()) {
      return LaunchFeedSchema.parse(localBagsStubs.launchFeed());
    }
    return bagsReadCache("launch-feed", 120, () =>
      bagsRest("token-launch/feed", LaunchFeedSchema),
    );
  },

  /**
   * Resolve the DBC + DAMM v2 pool keys for a given token mint via REST.
   * `tokenMint` is a query param, NOT a path param.
   */
  async getPoolByTokenMint(tokenMint: string): Promise<PoolByMint> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenMint)) {
      return PoolByMintSchema.parse(localBagsStubs.poolByMint(tokenMint));
    }
    return bagsReadCache(`pool-by-token-mint:${tokenMint}`, 60 * 60, () =>
      bagsRest("solana/bags/pools/token-mint", PoolByMintSchema, {
        query: { tokenMint },
      }),
    );
  },

  async getPoolConfigKeysByFeeClaimerVaults(
    feeClaimerVaults: string[],
  ): Promise<PoolConfigKeysResponse> {
    if (!hasCredentials.bags()) return { poolConfigKeys: [] };
    const key = feeClaimerVaults.slice().sort().join(",");
    return bagsReadCache(`pool-config-keys:${key}`, 300, async () => {
      const { PublicKey } = await import("@solana/web3.js");
      const sdk = await tryGetSdk();
      const poolConfigKeys = sdk
        ? (
            await sdk.state.getPoolConfigKeysByFeeClaimerVaults(
              feeClaimerVaults.map((vault) => new PublicKey(vault)),
            )
          ).map(publicKeyToString)
        : (
            await bagsRest(
              "token-launch/state/pool-config",
              z.object({
                poolConfigKeys: z.array(SolanaAddressSchema.nullable()),
              }),
              {
                method: "POST",
                body: JSON.stringify({ feeClaimerVaults }),
              },
            )
          ).poolConfigKeys.filter((poolKey): poolKey is string => poolKey !== null);
      return PoolConfigKeysResponseSchema.parse({ poolConfigKeys });
    });
  },

  async getPartnerConfig(
    partnerWallet = serverEnv().BAGS_PARTNER_WALLET,
  ): Promise<PartnerConfig> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for partner config reads.");
    }
    return bagsReadCache(`partner-config:${partnerWallet}`, 300, async () => {
      const [{ PublicKey }, sdk] = await Promise.all([
        import("@solana/web3.js"),
        getSdk(),
      ]);
      const raw = await sdk.partner.getPartnerConfig(
        new PublicKey(partnerWallet),
      );
      return PartnerConfigSchema.parse(normalizePublicKeyFields(raw));
    });
  },

  async getPartnerClaimStats(
    partnerWallet = serverEnv().BAGS_PARTNER_WALLET,
    options?: { cache?: boolean },
  ): Promise<PartnerClaimStats> {
    if (!hasCredentials.bags()) {
      return PartnerClaimStatsSchema.parse({
        claimedFees: "0",
        unclaimedFees: "0",
      });
    }
    const read = async () => {
      const { PublicKey } = await import("@solana/web3.js");
      const sdk = await tryGetSdk();
      const raw = sdk
        ? await sdk.partner.getPartnerConfigClaimStats(
            new PublicKey(partnerWallet),
          )
        : await bagsRest(
            "fee-share/partner-config/stats",
            PartnerClaimStatsSchema,
            {
              query: { partner: partnerWallet },
            },
          );
      return PartnerClaimStatsSchema.parse(raw);
    };
    if (options?.cache === false) return read();
    return bagsReadCache(`partner-claim-stats:${partnerWallet}`, 30, read);
  },

  async getPartnerConfigCreationTransaction(
    partnerWallet = serverEnv().BAGS_PARTNER_WALLET,
  ): Promise<TransactionWithBlockhash> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for partner config creation.");
    }
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.partner.getPartnerConfigCreationTransaction(
          new PublicKey(partnerWallet),
        )
      : (
          await bagsRest(
            "fee-share/partner-config/creation-tx",
            z.object({ transaction: TransactionWithBlockhashSchema }),
            {
              method: "POST",
              body: JSON.stringify({ partnerWallet }),
            },
          )
        ).transaction;
    return TransactionWithBlockhashSchema.parse(raw);
  },

  async getPartnerClaimTransactions(
    partnerWallet = serverEnv().BAGS_PARTNER_WALLET,
  ): Promise<TransactionWithBlockhash[]> {
    if (!hasCredentials.bags()) return [];
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const transactions = sdk
      ? await sdk.partner.getPartnerConfigClaimTransactions(
          new PublicKey(partnerWallet),
        )
      : (
          await bagsRest(
            "fee-share/partner-config/claim-tx",
            z.object({
              transactions: z.array(TransactionWithBlockhashSchema),
            }),
            {
              method: "POST",
              body: JSON.stringify({ partnerWallet }),
            },
          )
        ).transactions;
    return transactions.map((tx) => TransactionWithBlockhashSchema.parse(tx));
  },

  async getTradeQuote(input: TradeQuoteInput): Promise<TradeQuoteResponse> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for trade quotes.");
    }
    const validated = TradeQuoteInputSchema.parse(input);
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.trade.getQuote({
          ...validated,
          inputMint: new PublicKey(validated.inputMint),
          outputMint: new PublicKey(validated.outputMint),
        })
      : await bagsRest("trade/quote", TradeQuoteResponseSchema, {
          query: Object.fromEntries(
            Object.entries(validated)
              .filter((entry): entry is [string, string | number] => {
                const value = entry[1];
                return typeof value === "string" || typeof value === "number";
              })
              .map(([key, value]) => [key, String(value)]),
          ),
        });
    return TradeQuoteResponseSchema.parse(raw);
  },

  async createSwapTransaction(
    input: TradeSwapInput,
  ): Promise<TradeSwapTransaction> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for trade swaps.");
    }
    const validated = TradeSwapInputSchema.parse(input);
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.trade.createSwapTransaction({
          quoteResponse: validated.quoteResponse,
          userPublicKey: new PublicKey(validated.userPublicKey),
        })
      : await bagsRest(
          "trade/swap",
          z
            .object({
              swapTransaction: z.unknown(),
              computeUnitLimit: z.number().int().positive(),
              lastValidBlockHeight: z.number().int().positive(),
              prioritizationFeeLamports: z.number().int().min(0),
            })
            .loose(),
          {
            method: "POST",
            body: JSON.stringify(validated),
          },
        );
    const rawRecord =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const transaction = rawRecord.swapTransaction ?? rawRecord.transaction;
    return TradeSwapTransactionSchema.parse({ ...rawRecord, transaction });
  },

  async getFeeShareAdminTokenMints(wallet: string): Promise<string[]> {
    if (!hasCredentials.bags()) return [];
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    return sdk
      ? await sdk.feeShareAdmin.getAdminTokenMints(new PublicKey(wallet))
      : (
          await bagsRest(
            "fee-share/admin/list",
            z.object({ tokenMints: z.array(SolanaAddressSchema) }),
            { query: { wallet } },
          )
        ).tokenMints;
  },

  async getTransferFeeShareAdminTransaction(
    input: FeeShareAdminTransferInput,
  ): Promise<TransactionWithBlockhash> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for fee-share admin updates.");
    }
    const validated = FeeShareAdminTransferInputSchema.parse(input);
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.feeShareAdmin.getTransferAdminTransaction({
          baseMint: new PublicKey(validated.baseMint),
          currentAdmin: new PublicKey(validated.currentAdmin),
          newAdmin: new PublicKey(validated.newAdmin),
          payer: new PublicKey(validated.payer),
        })
      : (
          await bagsRest(
            "fee-share/admin/transfer-tx",
            z.object({ transaction: TransactionWithBlockhashSchema }),
            {
              method: "POST",
              body: JSON.stringify(validated),
            },
          )
        ).transaction;
    return TransactionWithBlockhashSchema.parse(raw);
  },

  async getUpdateFeeShareConfigTransactions(
    input: FeeShareAdminUpdateConfigInput,
  ): Promise<TransactionWithBlockhash[]> {
    if (!hasCredentials.bags()) return [];
    const validated = FeeShareAdminUpdateConfigInputSchema.parse(input);
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const transactions = sdk
      ? await sdk.feeShareAdmin.getUpdateConfigTransactions({
          baseMint: new PublicKey(validated.baseMint),
          payer: new PublicKey(validated.payer),
          feeClaimers: validated.feeClaimers.map((claimer) => ({
            user: new PublicKey(claimer.wallet),
            userBps: claimer.bps,
          })),
          additionalLookupTables: validated.additionalLookupTables?.map(
            (table) => new PublicKey(table),
          ),
        })
      : (
          await bagsRest(
            "fee-share/admin/update-config",
            z.object({ transactions: z.array(TransactionWithBlockhashSchema) }),
            {
              method: "POST",
              body: JSON.stringify({
                baseMint: validated.baseMint,
                payer: validated.payer,
                basisPointsArray: validated.feeClaimers.map(
                  (claimer) => claimer.bps,
                ),
                claimersArray: validated.feeClaimers.map(
                  (claimer) => claimer.wallet,
                ),
                additionalLookupTables: validated.additionalLookupTables,
              }),
            },
          )
        ).transactions;
    return transactions.map((tx) => TransactionWithBlockhashSchema.parse(tx));
  },

  async checkDexscreenerOrderAvailability(
    tokenAddress: string,
  ): Promise<DexscreenerAvailability> {
    if (!hasCredentials.bags()) return stubBags.dexscreenerAvailability();
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.dexscreener.checkOrderAvailability({
          tokenAddress: new PublicKey(tokenAddress),
        })
      : await bagsRest(
          "solana/dexscreener/order-availability",
          DexscreenerAvailabilitySchema,
          { query: { tokenAddress } },
        );
    return DexscreenerAvailabilitySchema.parse(raw);
  },

  async createDexscreenerOrder(
    input: DexscreenerOrderInput,
  ): Promise<DexscreenerOrder> {
    const validated = DexscreenerOrderInputSchema.parse(input);
    if (!hasCredentials.bags()) return stubBags.dexscreenerOrder();
    const { PublicKey } = await import("@solana/web3.js");
    const sdk = await tryGetSdk();
    const raw = sdk
      ? await sdk.dexscreener.createOrder({
          ...validated,
          tokenAddress: new PublicKey(validated.tokenAddress),
          payerWallet: new PublicKey(validated.payerWallet),
        })
      : await bagsRest(
          "solana/dexscreener/create-order",
          DexscreenerOrderSchema,
          {
            method: "POST",
            body: JSON.stringify(validated),
          },
        );
    return DexscreenerOrderSchema.parse(raw);
  },

  async submitDexscreenerPayment(args: {
    orderUUID: string;
    paymentSignature: string;
  }): Promise<string> {
    if (!hasCredentials.bags()) {
      return stubBags.dexscreenerSubmitPayment(args.orderUUID);
    }
    const sdk = await tryGetSdk();
    return sdk
      ? await sdk.dexscreener.submitPayment(args)
      : await bagsRest("solana/dexscreener/submit-payment", z.string(), {
          method: "POST",
          body: JSON.stringify(args),
        });
  },

  async startIncorporationPayment(args: {
    payerWallet: string;
    payWithSol?: boolean;
  }): Promise<IncorporationPayment> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for incorporation payments.");
    }
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);
    const raw = await sdk.incorporation.startPayment({
      payerWallet: new PublicKey(args.payerWallet),
      payWithSol: args.payWithSol,
    });
    return IncorporationPaymentSchema.parse(raw);
  },

  async submitIncorporation(
    input: IncorporationInput,
  ): Promise<IncorporationProject> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for incorporation.");
    }
    const validated = IncorporationInputSchema.parse(input);
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);
    const raw = await sdk.incorporation.incorporate({
      ...validated,
      tokenAddress: new PublicKey(validated.tokenAddress),
    });
    return IncorporationProjectSchema.parse(raw);
  },

  async getIncorporationDetails(
    tokenAddress: string,
  ): Promise<IncorporationProject | null> {
    if (!hasCredentials.bags() || isPlaceholderTokenMint(tokenAddress)) {
      return null;
    }
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);
    const raw = await sdk.incorporation.getDetails({
      tokenAddress: new PublicKey(tokenAddress),
    });
    return IncorporationProjectSchema.parse(raw);
  },

  async listIncorporations(): Promise<IncorporationProject[]> {
    if (!hasCredentials.bags()) return [];
    const sdk = await getSdk();
    const raw = await sdk.incorporation.list();
    return raw.map((project) => IncorporationProjectSchema.parse(project));
  },

  async startIncorporation(
    tokenAddress: string,
  ): Promise<StartIncorporationResponse> {
    if (!hasCredentials.bags()) {
      throw new Error("BAGS_API_KEY is required for incorporation.");
    }
    const [{ PublicKey }, sdk] = await Promise.all([
      import("@solana/web3.js"),
      getSdk(),
    ]);
    const raw = await sdk.incorporation.startIncorporation({
      tokenAddress: new PublicKey(tokenAddress),
    });
    return StartIncorporationResponseSchema.parse(raw);
  },
};

export type BagsClient = typeof bags;
