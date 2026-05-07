import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  __resetProgramForTests,
  BAGS_FEE_SHARE_V2_PROGRAM_ID,
  buildManagerTransferIx,
  buildManagerUpdateFeeConfigIx,
  buildManagerWaiveIx,
  buildSetManagerIx,
  deriveEventAuthorityPda,
  deriveFeeShareAuthorityPda,
  deriveFeeShareConfigPda,
  deriveProgramConfigPda,
  WSOL_MINT,
} from "./program-client";

// Discriminators sourced from the IDL — verifying these in tests keeps the
// program-client honest if the SDK ever ships a re-generated IDL with
// different discriminators (which would mean a program upgrade).
const DISCRIMINATOR = {
  updateFeeConfigManager: Buffer.from([196, 8, 168, 199, 166, 4, 77, 212]),
  managerUpdateFeeConfig: Buffer.from([84, 56, 125, 101, 210, 214, 195, 197]),
  managerTransferFeeConfig: Buffer.from([141, 74, 17, 174, 124, 11, 170, 227]),
  managerWaiveFeeConfig: Buffer.from([105, 51, 140, 114, 254, 160, 173, 172]),
} as const;

const TEST_MINT_A = new PublicKey("So11111111111111111111111111111111111111112");
const TEST_MINT_B = new PublicKey("BAGSyG2DfCkXKMupzGqf6n4yKKPxEqfwbkkJgsFqxKYf");

function fakeConnection(): Connection {
  // We never actually send anything through this — the Anchor Program just
  // needs a connection-shaped object during construction.
  return new Connection("http://localhost:1337", "processed");
}

describe("PDA derivations", () => {
  it("program_config PDA is deterministic and not the zero pubkey", () => {
    const [pda1, bump1] = deriveProgramConfigPda();
    const [pda2, bump2] = deriveProgramConfigPda();
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
    expect(pda1.equals(PublicKey.default)).toBe(false);
    expect(pda1.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)).toBe(false);
  });

  it("event_authority PDA matches Anchor's __event_authority convention", () => {
    const [pda, bump] = deriveEventAuthorityPda();
    // Re-derive using the literal seed string to confirm the constant in
    // program-client matches Anchor's convention.
    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      BAGS_FEE_SHARE_V2_PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
    expect(bump).toBe(expectedBump);
  });

  it("fee_share_config PDA differs per (base_mint, quote_mint) pair", () => {
    const [a] = deriveFeeShareConfigPda(TEST_MINT_A, WSOL_MINT);
    const [b] = deriveFeeShareConfigPda(TEST_MINT_B, WSOL_MINT);
    const [c] = deriveFeeShareConfigPda(TEST_MINT_A, TEST_MINT_B); // different quote
    expect(a.equals(b)).toBe(false);
    expect(a.equals(c)).toBe(false);
    expect(b.equals(c)).toBe(false);
  });

  it("fee_share_config and fee_share_authority share the same mint pair but differ", () => {
    const [config] = deriveFeeShareConfigPda(TEST_MINT_A);
    const [authority] = deriveFeeShareAuthorityPda(TEST_MINT_A);
    expect(config.equals(authority)).toBe(false);
  });

  it("defaults quote_mint to WSOL when omitted", () => {
    const [withDefault] = deriveFeeShareConfigPda(TEST_MINT_A);
    const [explicit] = deriveFeeShareConfigPda(TEST_MINT_A, WSOL_MINT);
    expect(withDefault.equals(explicit)).toBe(true);
  });
});

describe("buildSetManagerIx (update_fee_config_manager, admin-gated)", () => {
  beforeEach(() => __resetProgramForTests());
  afterEach(() => __resetProgramForTests());

  it("returns an instruction targeted at the fee-share-v2 program with the right discriminator", async () => {
    const admin = Keypair.generate().publicKey;
    const newManager = Keypair.generate().publicKey;
    const ix = await buildSetManagerIx({
      connection: fakeConnection(),
      admin,
      payer: admin,
      newManager,
      baseMint: TEST_MINT_A,
    });
    expect(ix.programId.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)).toBe(true);
    expect(ix.data.subarray(0, 8).equals(DISCRIMINATOR.updateFeeConfigManager)).toBe(
      true,
    );
    // Args are empty (new_manager is in accounts, not args).
    expect(ix.data.length).toBe(8);
  });

  it("places admin and payer as signers and computes the right PDAs", async () => {
    const admin = Keypair.generate().publicKey;
    const newManager = Keypair.generate().publicKey;
    const ix = await buildSetManagerIx({
      connection: fakeConnection(),
      admin,
      payer: admin,
      newManager,
      baseMint: TEST_MINT_A,
    });
    const accountByPubkey = new Map(
      ix.keys.map((k) => [k.pubkey.toBase58(), k]),
    );
    expect(accountByPubkey.get(admin.toBase58())?.isSigner).toBe(true);
    expect(accountByPubkey.get(newManager.toBase58())?.isSigner).toBe(false);
    const [feeShareConfig] = deriveFeeShareConfigPda(TEST_MINT_A);
    expect(accountByPubkey.get(feeShareConfig.toBase58())).toBeDefined();
  });
});

describe("buildManagerUpdateFeeConfigIx (manager-gated BPS rebalance)", () => {
  beforeEach(() => __resetProgramForTests());
  afterEach(() => __resetProgramForTests());

  const baseArgs = () => ({
    connection: fakeConnection(),
    manager: Keypair.generate().publicKey,
    payer: Keypair.generate().publicKey,
    baseMint: TEST_MINT_A,
    bps: [3000, 3000, 4000],
    fromIdx: 0,
    toIdx: 2,
    finalizeUpdate: false,
  });

  it("rejects bps length mismatch with slot range", async () => {
    await expect(
      buildManagerUpdateFeeConfigIx({ ...baseArgs(), bps: [5000, 5000] }),
    ).rejects.toThrow(/bps vector length/);
  });

  it("rejects toIdx < fromIdx", async () => {
    await expect(
      buildManagerUpdateFeeConfigIx({
        ...baseArgs(),
        bps: [],
        fromIdx: 5,
        toIdx: 2,
      }),
    ).rejects.toThrow(/toIdx must be >= fromIdx/);
  });

  it("rejects bps values outside [0, 10000]", async () => {
    await expect(
      buildManagerUpdateFeeConfigIx({
        ...baseArgs(),
        bps: [3000, 3000, 99999],
      }),
    ).rejects.toThrow(/bps values must be integers/);
  });

  it("rejects out-of-range slot indices (must fit u8)", async () => {
    await expect(
      buildManagerUpdateFeeConfigIx({
        ...baseArgs(),
        bps: new Array(257).fill(0),
        fromIdx: 0,
        toIdx: 256,
      }),
    ).rejects.toThrow(/u8/);
  });

  it("emits the right discriminator and includes the manager as signer", async () => {
    const args = baseArgs();
    const ix = await buildManagerUpdateFeeConfigIx(args);
    expect(ix.programId.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)).toBe(true);
    expect(ix.data.subarray(0, 8).equals(DISCRIMINATOR.managerUpdateFeeConfig)).toBe(
      true,
    );
    const managerEntry = ix.keys.find((k) => k.pubkey.equals(args.manager));
    expect(managerEntry?.isSigner).toBe(true);
    expect(managerEntry?.isWritable).toBe(true);
  });

  it("encodes finalize_update + slot indices into the ix data after the discriminator", async () => {
    const args = baseArgs();
    const ix = await buildManagerUpdateFeeConfigIx({
      ...args,
      finalizeUpdate: true,
      fromIdx: 1,
      toIdx: 3,
      bps: [100, 200, 300],
    });
    // After the 8-byte discriminator: borsh-encoded ManagerUpdateFeeConfigParameters:
    //   - bps: vec<u16>            -> 4 bytes length-prefix (LE u32) + 2*N bytes
    //   - finalize_update: bool    -> 1 byte
    //   - from_idx: u8             -> 1 byte
    //   - to_idx: u8               -> 1 byte
    const data = ix.data.subarray(8);
    // Length prefix
    expect(data.readUInt32LE(0)).toBe(3);
    // bps[0..3]
    expect(data.readUInt16LE(4)).toBe(100);
    expect(data.readUInt16LE(6)).toBe(200);
    expect(data.readUInt16LE(8)).toBe(300);
    // finalize_update
    expect(data.readUInt8(10)).toBe(1);
    // from_idx
    expect(data.readUInt8(11)).toBe(1);
    // to_idx
    expect(data.readUInt8(12)).toBe(3);
  });
});

describe("buildManagerTransferIx (manager-gated role rotation)", () => {
  beforeEach(() => __resetProgramForTests());
  afterEach(() => __resetProgramForTests());

  it("returns an instruction with the right discriminator and account roles", async () => {
    const manager = Keypair.generate().publicKey;
    const newManager = Keypair.generate().publicKey;
    const ix = await buildManagerTransferIx({
      connection: fakeConnection(),
      manager,
      payer: manager,
      newManager,
      baseMint: TEST_MINT_A,
    });
    expect(ix.programId.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)).toBe(true);
    expect(ix.data.subarray(0, 8).equals(DISCRIMINATOR.managerTransferFeeConfig)).toBe(
      true,
    );
    expect(ix.data.length).toBe(8); // no args
    const managerEntry = ix.keys.find((k) => k.pubkey.equals(manager));
    expect(managerEntry?.isSigner).toBe(true);
    const newManagerEntry = ix.keys.find((k) => k.pubkey.equals(newManager));
    expect(newManagerEntry?.isSigner).toBe(false);
  });
});

describe("buildManagerWaiveIx (manager-gated role drop)", () => {
  beforeEach(() => __resetProgramForTests());
  afterEach(() => __resetProgramForTests());

  it("returns an instruction with the right discriminator", async () => {
    const manager = Keypair.generate().publicKey;
    const ix = await buildManagerWaiveIx({
      connection: fakeConnection(),
      manager,
      payer: manager,
      baseMint: TEST_MINT_A,
    });
    expect(ix.programId.equals(BAGS_FEE_SHARE_V2_PROGRAM_ID)).toBe(true);
    expect(ix.data.subarray(0, 8).equals(DISCRIMINATOR.managerWaiveFeeConfig)).toBe(
      true,
    );
    expect(ix.data.length).toBe(8); // no args
    const managerEntry = ix.keys.find((k) => k.pubkey.equals(manager));
    expect(managerEntry?.isSigner).toBe(true);
  });
});
