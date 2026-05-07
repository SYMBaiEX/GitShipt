import { dbHttp } from "@/db";
import { platformConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serverEnv } from "@/lib/env";

/**
 * Platform-wide kill switch. Two layers:
 *
 *   - `EMERGENCY_KILL_SWITCH` env var — out-of-band stop, set when the
 *     DB itself may be unhealthy. Read at process boot per request, no
 *     DB lookup required.
 *   - `kill_switch.global` row in `platform_config` — normal operator
 *     toggle. Surfaces from the admin UI, requires DB.
 *
 * Money-moving paths (manager_update_fee_config rebalance, partner-fee
 * claim, anything that broadcasts a tx with the manager keypair) MUST
 * call `isKillSwitchEnabled()` before signing and abort if true.
 */
export async function isKillSwitchEnabled(): Promise<boolean> {
  if (serverEnv().EMERGENCY_KILL_SWITCH) return true;
  const [row] = await dbHttp
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(eq(platformConfig.key, "kill_switch.global"))
    .limit(1);
  if (!row) return false;
  const enabled = (row.value as { enabled?: unknown }).enabled;
  return enabled === true;
}
