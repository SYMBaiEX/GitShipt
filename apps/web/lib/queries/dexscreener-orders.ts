import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { dbHttp } from "@/db";
import { dexscreenerOrders } from "@/db/schema";
import { cacheTags } from "@/lib/cache";
import { hasCredentials } from "@/lib/env";

export interface DexscreenerOrderSummary {
  id: string;
  orderUuid: string;
  status: "pending" | "broadcast" | "paid" | "failed" | "stub_paid";
  stub: boolean;
  priceUsdc: string;
  payWithSol: boolean;
  paymentSignature: string | null;
  errorMessage: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

/**
 * Returns the active or most-recent DexScreener order for a project.
 * "Active" = `pending` / `broadcast` / `paid` / `stub_paid` (anything
 * that holds the partial-unique slot). When none of those exist we fall
 * back to the latest `failed` row so the dashboard can surface a "retry"
 * affordance.
 */
async function getActiveDexscreenerOrderForProjectUncached(
  projectId: string,
): Promise<DexscreenerOrderSummary | null> {
  if (!hasCredentials.db()) return null;

  const [active] = await dbHttp
    .select({
      id: dexscreenerOrders.id,
      orderUuid: dexscreenerOrders.orderUuid,
      status: dexscreenerOrders.status,
      stub: dexscreenerOrders.stub,
      priceUsdc: dexscreenerOrders.priceUsdc,
      payWithSol: dexscreenerOrders.payWithSol,
      paymentSignature: dexscreenerOrders.paymentSignature,
      errorMessage: dexscreenerOrders.errorMessage,
      createdAt: dexscreenerOrders.createdAt,
      paidAt: dexscreenerOrders.paidAt,
    })
    .from(dexscreenerOrders)
    .where(
      and(
        eq(dexscreenerOrders.projectId, projectId),
        inArray(dexscreenerOrders.status, [
          "pending",
          "broadcast",
          "paid",
          "stub_paid",
        ] as const),
      ),
    )
    .orderBy(desc(dexscreenerOrders.createdAt))
    .limit(1);
  if (active) return active;

  const [latest] = await dbHttp
    .select({
      id: dexscreenerOrders.id,
      orderUuid: dexscreenerOrders.orderUuid,
      status: dexscreenerOrders.status,
      stub: dexscreenerOrders.stub,
      priceUsdc: dexscreenerOrders.priceUsdc,
      payWithSol: dexscreenerOrders.payWithSol,
      paymentSignature: dexscreenerOrders.paymentSignature,
      errorMessage: dexscreenerOrders.errorMessage,
      createdAt: dexscreenerOrders.createdAt,
      paidAt: dexscreenerOrders.paidAt,
    })
    .from(dexscreenerOrders)
    .where(eq(dexscreenerOrders.projectId, projectId))
    .orderBy(desc(dexscreenerOrders.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function getActiveDexscreenerOrderForProject(
  projectId: string,
): Promise<DexscreenerOrderSummary | null> {
  "use cache";
  cacheLife("dashboard");
  cacheTag(cacheTags.project(projectId));
  cacheTag(cacheTags.dashboardProject(projectId));
  return getActiveDexscreenerOrderForProjectUncached(projectId);
}
