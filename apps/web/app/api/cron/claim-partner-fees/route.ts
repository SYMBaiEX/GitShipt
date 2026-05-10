import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { safeStartWorkflow } from "@/lib/cron-helpers";
import { claimPartnerFeesWorkflow } from "@/workflows/claimPartnerFees";

export const maxDuration = 800;

/**
 * Cron endpoint for claiming partner fees from Bags.
 *
 * This endpoint is triggered by Vercel Cron to claim accumulated partner fees
 * from the Bags partner configuration. GitShipt receives 25% (2,500 bps) of
 * trading fees from all tokens launched through the platform.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await isAuthorizedCron(request);
  if (!auth) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return safeStartWorkflow(claimPartnerFeesWorkflow, [], "claim-partner-fees");
}
