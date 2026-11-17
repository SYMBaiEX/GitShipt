import "server-only";
import { and, eq } from "drizzle-orm";
import { dbHttp } from "@/db";
import { withRlsContext } from "@/db/rls-context";
import "@/db/rls-storage-init";
import { wallets } from "@/db/schema";

export async function isWalletBoundToUser(
  userId: string,
  address: string,
): Promise<boolean> {
  const [row] = await withRlsContext(
    { mode: "user", userId, role: "user", reason: "launch:own-wallet" },
    () =>
      dbHttp
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(
            eq(wallets.userId, userId),
            eq(wallets.address, address),
            eq(wallets.chain, "solana"),
          ),
        )
        .limit(1),
  );
  return Boolean(row);
}
