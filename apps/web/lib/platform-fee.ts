import "server-only";
import "@/db/rls-storage-init";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { dbHttp } from "@/db";
import { platformConfig } from "@/db/schema";
import { withRlsContext } from "@/db/rls-context";

const PlatformFeeConfig = z.object({
  value: z.number().int().min(0).max(10_000),
});

export async function platformFeeBps(): Promise<number> {
  // This one public scalar must be readable consistently for non-admin launchers.
  const [row] = await withRlsContext(
    { mode: "service", reason: "launch-platform-fee" },
    async () =>
      await dbHttp
        .select({ value: platformConfig.value })
        .from(platformConfig)
        .where(eq(platformConfig.key, "fees.platform_bps"))
        .limit(1),
  );
  return row ? PlatformFeeConfig.parse(row.value).value : 1000;
}
