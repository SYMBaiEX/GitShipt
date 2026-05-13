import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { safeStartWorkflow } from "@/lib/cron-helpers";
import { revalidateBotFlags } from "@/workflows/revalidateBotFlags";

export const maxDuration = 800;

/**
 * Weekly bot-flag revalidation cron.
 *
 * Re-runs `isAiBot()` against every contributor whose exclusion reason is
 * automatic (`bot_detected` / `treasury_routed_agent` / null). Adding a
 * new pattern to the shared AI list retroactively re-classifies
 * historical rows on the next run, without waiting for the contributor
 * to commit again.
 *
 * Manual `excluded_reason` values are preserved.
 *
 * Protected by `CRON_SECRET`.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return safeStartWorkflow(revalidateBotFlags, [], "revalidate-bot-flags");
}
