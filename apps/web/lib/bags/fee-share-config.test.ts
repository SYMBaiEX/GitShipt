import { Keypair, PublicKey } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FeeShareArgs = {
  treasury?: string;
  partner?: string;
  partnerConfig?: string;
  signer?: Keypair;
};

type FeeShareConfigCall = {
  payer: PublicKey;
  baseMint: PublicKey;
  feeClaimers: Array<{ user: PublicKey; userBps: number }>;
  partner?: PublicKey;
  partnerConfig?: PublicKey;
};

async function importBagsWithMocks(args: FeeShareArgs = {}) {
  vi.resetModules();
  const signer = args.signer ?? Keypair.generate();
  const createBagsFeeShareConfig = vi.fn(async () => ({
    meteoraConfigKey: Keypair.generate().publicKey,
    transactions: [],
    bundles: [],
  }));
  const getLaunchWalletV2Bulk = vi.fn(async () => []);

  vi.doMock("@bagsfm/bags-sdk", () => ({
    BagsSDK: vi.fn(
      class {
        state = {
          getLaunchWalletV2Bulk,
        };
        config = {
          createBagsFeeShareConfig,
        };
      },
    ),
  }));
  vi.doMock("@/lib/env", () => ({
    serverEnv: () => ({
      NODE_ENV: "test",
      BAGS_API_KEY: "bags_test_key",
      HELIUS_RPC_URL: "https://example.com/rpc",
      BAGS_API_BASE_URL: "https://public-api-v2.bags.fm/api/v1/",
      SOLANA_TREASURY_ADDRESS: args.treasury,
      BAGS_PARTNER_WALLET: args.partner,
      BAGS_PARTNER_CONFIG_KEY: args.partnerConfig,
      BAGS_CONFIG_TYPE: undefined,
    }),
    hasCredentials: {
      bags: () => true,
      payoutKey: () => true,
      solana: () => true,
    },
    canLaunchOnBags: () => ({ ok: true }),
    stubsAllowed: () => false,
  }));
  vi.doMock("@/lib/solana/signer", () => ({
    payoutSigner: vi.fn(() => signer),
  }));
  vi.doMock("@/lib/solana/connection", () => ({
    solanaConnection: vi.fn(() => ({})),
  }));
  vi.doMock("@/lib/solana/simulation", () => ({
    assertTransactionSimulation: vi.fn(),
  }));

  const { bags } = await import("./client");
  return { bags, signer, createBagsFeeShareConfig, getLaunchWalletV2Bulk };
}

describe("bags.createFeeShareConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("@bagsfm/bags-sdk");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/lib/solana/signer");
    vi.doUnmock("@/lib/solana/connection");
    vi.doUnmock("@/lib/solana/simulation");
  });

  it("preserves the partner config rail without a treasury claimer", async () => {
    const signer = Keypair.generate();
    const poolClaimer = Keypair.generate().publicKey.toBase58();
    const treasury = Keypair.generate().publicKey.toBase58();
    const partner = Keypair.generate().publicKey.toBase58();
    const partnerConfig = Keypair.generate().publicKey.toBase58();
    const { bags, createBagsFeeShareConfig } = await importBagsWithMocks({
      signer,
      treasury,
      partner,
      partnerConfig,
    });
    const baseMint = Keypair.generate().publicKey.toBase58();

    const result = await bags.createFeeShareConfig({
      payer: signer.publicKey.toBase58(),
      baseMint,
      feeClaimers: [{ wallet: poolClaimer, bps: 10_000 }],
      shareFee: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        feeClaimersTotalBps: 10_000,
        partnerWallet: partner,
        partnerConfigKey: partnerConfig,
        poolClaimerWallet: poolClaimer,
      }),
    );

    const calls = createBagsFeeShareConfig.mock.calls as unknown as [
      [FeeShareConfigCall],
    ];
    const call = calls[0][0];
    expect(call).toMatchObject({
      payer: signer.publicKey,
      baseMint: new PublicKey(baseMint),
      partner: new PublicKey(partner),
      partnerConfig: new PublicKey(partnerConfig),
    });
    expect(
      call?.feeClaimers.map(
        (claimer: { user: PublicKey; userBps: number }) => ({
          user: claimer.user.toBase58(),
          userBps: claimer.userBps,
        }),
      ),
    ).toEqual([{ user: poolClaimer, userBps: 10_000 }]);
  });

  it("requires treasury when a platform fee is configured", async () => {
    const signer = Keypair.generate();
    const poolClaimer = Keypair.generate().publicKey.toBase58();
    const { bags } = await importBagsWithMocks({ signer });

    await expect(
      bags.createFeeShareConfig({
        payer: signer.publicKey.toBase58(),
        baseMint: Keypair.generate().publicKey.toBase58(),
        feeClaimers: [{ wallet: poolClaimer, bps: 9_800 }],
        shareFee: 200,
      }),
    ).rejects.toThrow(/SOLANA_TREASURY_ADDRESS is required/);
  });

  it("rejects treasury wallets that overlap with payer or contributor claimers", async () => {
    const signer = Keypair.generate();
    const { bags } = await importBagsWithMocks({
      signer,
      treasury: signer.publicKey.toBase58(),
    });

    await expect(
      bags.createFeeShareConfig({
        payer: signer.publicKey.toBase58(),
        baseMint: Keypair.generate().publicKey.toBase58(),
        feeClaimers: [
          { wallet: Keypair.generate().publicKey.toBase58(), bps: 9_800 },
        ],
        shareFee: 200,
      }),
    ).rejects.toThrow(/must be distinct from the payout wallet/);

    const signer2 = Keypair.generate();
    const poolClaimer = Keypair.generate().publicKey.toBase58();
    const overlap = await importBagsWithMocks({
      signer: signer2,
      treasury: poolClaimer,
    });

    await expect(
      overlap.bags.createFeeShareConfig({
        payer: signer2.publicKey.toBase58(),
        baseMint: Keypair.generate().publicKey.toBase58(),
        feeClaimers: [{ wallet: poolClaimer, bps: 9_800 }],
        shareFee: 200,
      }),
    ).rejects.toThrow(/distinct from contributor pool/);
  });

  it("requires partner wallet and partner config to be configured as a pair", async () => {
    const signer = Keypair.generate();
    const { bags } = await importBagsWithMocks({
      signer,
      treasury: Keypair.generate().publicKey.toBase58(),
      partner: Keypair.generate().publicKey.toBase58(),
    });

    await expect(
      bags.createFeeShareConfig({
        payer: signer.publicKey.toBase58(),
        baseMint: Keypair.generate().publicKey.toBase58(),
        feeClaimers: [
          { wallet: Keypair.generate().publicKey.toBase58(), bps: 9_800 },
        ],
        shareFee: 200,
      }),
    ).rejects.toThrow(/BAGS_PARTNER_CONFIG_KEY is required/);
  });
});
