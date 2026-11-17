import { Keypair } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    BAGS_API_KEY: "test",
    BAGS_API_BASE_URL: "https://public-api-v2.bags.fm/api/v1/",
  }),
}));
import { DeployerBalancesSchema, getDeployerBalances } from "./deployer";

const wallet = Keypair.generate().publicKey.toBase58();
const tokenMint = Keypair.generate().publicKey.toBase58();
const data = {
  wallet,
  quoteMint: "So11111111111111111111111111111111111111112",
  positions: [
    {
      tokenMint,
      pendingDbcLamports: "3",
      pendingDammLamports: "5",
      accruedLamports: "7",
      totalClaimableLamports: "15",
    },
  ],
  vaultClaimableLamports: "9",
  unattributedVaultLamports: "2",
  totalClaimableLamports: "17",
};
afterEach(() => vi.unstubAllGlobals());
describe("Bags deployer accounting", () => {
  it("does not double count the aggregate vault", () => {
    expect(DeployerBalancesSchema.parse(data).totalClaimableLamports).toBe(
      "17",
    );
  });
  it("rejects double-counted wallet totals", () => {
    expect(
      DeployerBalancesSchema.safeParse({
        ...data,
        totalClaimableLamports: "26",
      }).success,
    ).toBe(false);
  });
  it("rejects inconsistent token and vault attribution", () => {
    expect(
      DeployerBalancesSchema.safeParse({ ...data, vaultClaimableLamports: "8" })
        .success,
    ).toBe(false);
    expect(
      DeployerBalancesSchema.safeParse({
        ...data,
        positions: [{ ...data.positions[0], totalClaimableLamports: "16" }],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate mint attribution", () => {
    expect(
      DeployerBalancesSchema.safeParse({
        ...data,
        positions: [data.positions[0], data.positions[0]],
      }).success,
    ).toBe(false);
  });
  it("keeps large lamports exact", () => {
    const n = "900719925474099300000";
    expect(
      DeployerBalancesSchema.parse({
        ...data,
        positions: [],
        vaultClaimableLamports: n,
        unattributedVaultLamports: n,
        totalClaimableLamports: n,
      }).totalClaimableLamports,
    ).toBe(n);
  });
  it("does not treat accounting unavailability as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(getDeployerBalances(wallet)).rejects.toThrow(/unavailable/);
  });
  it("rejects a response for another wallet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          response: {
            ...data,
            wallet: Keypair.generate().publicKey.toBase58(),
          },
        }),
      }),
    );
    await expect(getDeployerBalances(wallet)).rejects.toThrow(
      /wallet mismatch/,
    );
  });
});
