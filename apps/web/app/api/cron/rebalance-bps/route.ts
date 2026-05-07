import { NextResponse } from "next/server";
import { rebalanceBps } from "@/workflows/rebalanceBps";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { safeStartWorkflow } from "@/lib/cron-helpers";

export const maxDuration = 800;

/**
 * v1.1 Bags-native cadence cron — every 15 min.
 *
 * Triggers `rebalanceBps`, which loads payout_schedules whose
 * next_run_at is due and dispatches a per-schedule child workflow that
 * signs `manager_update_fee_config` with the GitShipt manager keypair.
 *
 * No SOL is custodied or dispatched. Contributors claim fees from Bags
 * directly through their GitHub-OAuth UI.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return safeStartWorkflow(rebalanceBps, [], "rebalance-bps");
}
