import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { readThroughCache } from "@/lib/read-through-cache";

const address = z.string().refine((value) => {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}, "Invalid Solana address");
const lamports = z
  .string()
  .regex(/^[0-9]+$/)
  .max(80);
const positionSchema = z.object({
  tokenMint: address,
  pendingDbcLamports: lamports,
  pendingDammLamports: lamports,
  accruedLamports: lamports,
  totalClaimableLamports: lamports,
});

export const DeployerBalancesSchema = z
  .object({
    wallet: address,
    quoteMint: z.literal("So11111111111111111111111111111111111111112"),
    positions: z.array(positionSchema).max(10_000),
    vaultClaimableLamports: lamports,
    unattributedVaultLamports: lamports,
    totalClaimableLamports: lamports,
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    let accrued = 0n;
    let total = BigInt(data.unattributedVaultLamports);
    for (const [index, p] of data.positions.entries()) {
      if (seen.has(p.tokenMint))
        ctx.addIssue({
          code: "custom",
          path: ["positions", index],
          message: "Duplicate token mint",
        });
      seen.add(p.tokenMint);
      const expected =
        BigInt(p.pendingDbcLamports) +
        BigInt(p.pendingDammLamports) +
        BigInt(p.accruedLamports);
      if (BigInt(p.totalClaimableLamports) !== expected)
        ctx.addIssue({
          code: "custom",
          path: ["positions", index, "totalClaimableLamports"],
          message: "Inconsistent token total",
        });
      accrued += BigInt(p.accruedLamports);
      total += BigInt(p.totalClaimableLamports);
    }
    if (
      BigInt(data.vaultClaimableLamports) !==
      accrued + BigInt(data.unattributedVaultLamports)
    )
      ctx.addIssue({
        code: "custom",
        path: ["vaultClaimableLamports"],
        message: "Inconsistent vault total",
      });
    if (BigInt(data.totalClaimableLamports) !== total)
      ctx.addIssue({
        code: "custom",
        path: ["totalClaimableLamports"],
        message: "Inconsistent wallet total",
      });
  });
export type DeployerBalances = z.infer<typeof DeployerBalancesSchema>;

/** Dedicated SOL deployer rail; never add the aggregate vault to token totals again. */
export async function getDeployerBalances(
  wallet: string,
  timeoutMs = 12_000,
): Promise<DeployerBalances> {
  address.parse(wallet);
  const env = serverEnv();
  if (!env.BAGS_API_KEY)
    throw new Error("BAGS_API_KEY is required for deployer revenue reads.");
  const url = new URL(
    "fee-share/deployer/claimable-positions",
    env.BAGS_API_BASE_URL,
  );
  url.searchParams.set("wallet", wallet);
  const response = await fetch(url, {
    headers: { "x-api-key": env.BAGS_API_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(
      `Bags deployer balances unavailable (HTTP ${response.status}).`,
    );
  const envelope = z
    .object({ success: z.literal(true), response: DeployerBalancesSchema })
    .parse(await response.json());
  if (envelope.response.wallet !== wallet)
    throw new Error("Bags deployer wallet mismatch.");
  return envelope.response;
}

// Presentation only. Claims and reconciliation must use the uncached read.
export function getDisplayedDeployerBalances(wallet: string): Promise<DeployerBalances> {
  return readThroughCache({
    key: `bags:deployer-display:${wallet}`,
    ttlSeconds: 30,
    loader: () => getDeployerBalances(wallet, 2_500),
  });
}
