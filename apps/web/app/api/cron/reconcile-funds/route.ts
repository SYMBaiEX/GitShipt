import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { safeStartWorkflow } from "@/lib/cron-helpers";
import { reconcileFunds } from "@/workflows/reconcileFunds";

export const maxDuration = 300;

/**
 * Daily fund-reconciliation cron.
 *
 * Snapshots operator-visible money state into `fund_reconciliation_runs`
 * and emits `fund.reconciliation_{warning,critical}` audit entries when
 * the summary is not clean. Read-only — never mutates money state.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return safeStartWorkflow(reconcileFunds, [], "reconcile-funds");
}
