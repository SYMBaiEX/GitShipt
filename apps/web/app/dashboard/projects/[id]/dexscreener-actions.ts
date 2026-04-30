"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { dbHttp } from "@/db";
import {
  dexscreenerOrders,
  projects,
  wallets,
  type DexscreenerOrderRow,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { withIdempotency, deriveKey } from "@/lib/idempotency";
import { check } from "@/lib/rate-limit";
import { updateProjectCaches } from "@/lib/cache-actions";
import { bags } from "@/lib/bags/client";
import { hasCredentials } from "@/lib/env";
import {
  CreateDexscreenerOrderInputSchema,
  SubmitDexscreenerPaymentInputSchema,
  DEXSCREENER_STUB_TX_SENTINEL,
  type CreateDexscreenerOrderInput,
  type SubmitDexscreenerPaymentInput,
  type DexscreenerOrderLink,
} from "@repo/shared";

/**
 * DexScreener Enhanced Token Info — Server Actions
 *
 * Two-step money flow brokered by Bags. The user's connected wallet pays
 * Bags (the recipient is a Bags-controlled wallet); GitShipt does not take
 * a cut.
 *
 *   1. createDexscreenerOrderAction — calls Bags' createOrder, persists a
 *      pending row, returns the server-built tx for the client to sign.
 *      In stub mode (no BAGS_API_KEY) the row is written as `stub_paid`
 *      immediately and the wallet-signing leg is skipped.
 *
 *   2. submitDexscreenerPaymentAction — after the client broadcasts the
 *      signed tx, the client posts the on-chain signature back so we can
 *      finalize with Bags. Idempotency is keyed on `orderUuid` so a network
 *      retry returns the cached envelope rather than calling Bags twice.
 *
 * Stub mode flow only uses (1); real mode uses (1) → wallet sign → (2).
 */

const ACTIVE_STATUSES = ["pending", "broadcast", "paid", "stub_paid"] as const satisfies readonly DexscreenerOrderRow["status"][];

function truncate(value: string, max = 256): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function requireSessionUserId(): Promise<string> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth/signin");
  return session.user.id;
}

async function assertWalletBoundToUser(
  userId: string,
  payerWallet: string,
): Promise<void> {
  // Strict SIWS-bind: the payer wallet must match a wallet the user
  // SIWS-verified on this account. Prevents a user from triggering a
  // payment from a wallet they do not own (the on-chain tx would still
  // require a signature, but we should not even surface the order
  // creation to a user without provenance).
  const [row] = await dbHttp
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.address, payerWallet)))
    .limit(1);
  if (!row) {
    throw new Error("Connected wallet is not linked to your account.");
  }
}

function deriveLinks(
  override: DexscreenerOrderLink[] | undefined,
  project: { ghOwner: string; ghRepo: string; tokenWebsiteUrl: string | null; tokenTwitterUrl: string | null; tokenTelegramUrl: string | null },
): DexscreenerOrderLink[] | undefined {
  if (override && override.length > 0) return override;
  const links: DexscreenerOrderLink[] = [];
  links.push({
    url: `https://github.com/${project.ghOwner}/${project.ghRepo}`,
    label: "GitHub",
  });
  if (project.tokenWebsiteUrl) {
    links.push({ url: project.tokenWebsiteUrl, label: "Website" });
  }
  if (project.tokenTwitterUrl) {
    links.push({ url: project.tokenTwitterUrl, label: "Twitter" });
  }
  if (project.tokenTelegramUrl) {
    links.push({ url: project.tokenTelegramUrl, label: "Telegram" });
  }
  return links.length > 0 ? links : undefined;
}

// ---------------------------------------------------------------------------
// createDexscreenerOrderAction
// ---------------------------------------------------------------------------

export type CreateDexscreenerOrderResult =
  | {
      ok: true;
      stub: true;
      orderUuid: string;
      rowId: string;
    }
  | {
      ok: true;
      stub: false;
      orderUuid: string;
      rowId: string;
      transactionBase64: string;
      priceUsdc: number;
      recipientWallet: string;
      lastValidBlockHeight: number;
    }
  | { ok: false; error: "already_ordered" | "not_launched" | "not_available" };

export async function createDexscreenerOrderAction(
  input: CreateDexscreenerOrderInput,
): Promise<CreateDexscreenerOrderResult> {
  // Auth-first contract per AGENTS.md: revalidate session before doing
  // anything else. We then do a minimal projectId extraction for the
  // permission scope, and only run the full Zod validation after the
  // caller is authorized.
  const userId = await requireSessionUserId();
  const targetProjectId = z
    .object({ projectId: z.string().min(1) })
    .parse(input).projectId;
  await requirePermission("project.update", {
    userId,
    projectId: targetProjectId,
  });

  const data = CreateDexscreenerOrderInputSchema.parse(input);

  const rl = await check(
    "default",
    `dexscreener:create:${userId}:${data.projectId}`,
  );
  if (!rl.success) throw new Error("Rate limited — try again shortly.");

  await assertWalletBoundToUser(userId, data.payerWallet);

  // Load project to resolve description / icon / links + verify launched.
  const [project] = await dbHttp
    .select({
      id: projects.id,
      name: projects.name,
      ghOwner: projects.ghOwner,
      ghRepo: projects.ghRepo,
      tokenMint: projects.tokenMint,
      description: projects.description,
      imageUrl: projects.imageUrl,
      tokenWebsiteUrl: projects.tokenWebsiteUrl,
      tokenTwitterUrl: projects.tokenTwitterUrl,
      tokenTelegramUrl: projects.tokenTelegramUrl,
    })
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project || !project.tokenMint) return { ok: false, error: "not_launched" };

  // Bags availability gate — stub mode short-circuits to true.
  const availability = await bags.checkDexscreenerOrderAvailability(
    project.tokenMint,
  );
  if (!availability.available) return { ok: false, error: "not_available" };

  const description = data.descriptionOverride ?? project.description ?? project.name;
  // GitHub identicon URL is square and always exists for any GitHub user
  // or org — better than re-using the wide header image.
  const iconImageUrl =
    data.iconImageUrlOverride ??
    project.imageUrl ??
    `https://github.com/${project.ghOwner}.png`;
  const links = deriveLinks(data.links, project);

  const idemKey = deriveKey(
    "dexscreener-create",
    userId,
    project.id,
    data.headerImageUrl,
  );

  const result = await withIdempotency(
    idemKey,
    async (): Promise<CreateDexscreenerOrderResult> => {
      // Duplicate-order guard runs INSIDE the idempotency wrapper so a
      // legitimate retry on the same idemKey returns the cached envelope
      // (with orderUuid + tx blob) instead of `already_ordered`. A retry
      // with a *different* idemKey (e.g. different headerImageUrl) still
      // hits this check and gets the duplicate rejection.
      const [existing] = await dbHttp
        .select({ id: dexscreenerOrders.id })
        .from(dexscreenerOrders)
        .where(
          and(
            eq(dexscreenerOrders.projectId, project.id),
            inArray(dexscreenerOrders.status, ACTIVE_STATUSES),
          ),
        )
        .limit(1);
      if (existing) return { ok: false, error: "already_ordered" };

      const order = await bags.createDexscreenerOrder({
        tokenAddress: project.tokenMint!,
        description,
        iconImageUrl,
        headerImageUrl: data.headerImageUrl,
        payerWallet: data.payerWallet,
        links,
        payWithSol: data.payWithSol,
      });

      const isStub = order.transaction === DEXSCREENER_STUB_TX_SENTINEL;
      const transactionBase64 =
        typeof order.transaction === "string" ? order.transaction : "";

      const insertValues = {
        projectId: project.id,
        tokenMint: project.tokenMint!,
        orderUuid: order.orderUUID,
        recipientWallet: order.recipientWallet,
        payerWallet: data.payerWallet,
        priceUsdc: order.priceUSDC.toFixed(2),
        payWithSol: Boolean(data.payWithSol),
        description,
        iconImageUrl,
        headerImageUrl: data.headerImageUrl,
        links: links ?? [],
        lastValidBlockHeight: order.lastValidBlockHeight,
        bagsTransactionBlob: isStub ? null : transactionBase64,
        paymentSignature: isStub ? `stub-ds-payment-${order.orderUUID}` : null,
        status: (isStub ? "stub_paid" : "pending") as DexscreenerOrderRow["status"],
        stub: isStub,
        paidAt: isStub ? new Date() : null,
      };

      const [row] = await dbHttp
        .insert(dexscreenerOrders)
        .values(insertValues)
        .returning({ id: dexscreenerOrders.id });

      if (!row) throw new Error("Failed to persist dexscreener order row.");

      if (isStub) {
        return {
          ok: true,
          stub: true,
          orderUuid: order.orderUUID,
          rowId: row.id,
        };
      }
      return {
        ok: true,
        stub: false,
        orderUuid: order.orderUUID,
        rowId: row.id,
        transactionBase64,
        priceUsdc: order.priceUSDC,
        recipientWallet: order.recipientWallet,
        lastValidBlockHeight: order.lastValidBlockHeight,
      };
    },
    { scope: `project:dexscreener-create:${project.id}:${userId}` },
  );

  if (!result.ok) return result;

  await audit({
    actorUserId: userId,
    action: "dexscreener.order_create",
    targetType: "project",
    targetId: project.id,
    metadata: {
      orderUuid: result.orderUuid,
      stub: result.stub,
      payWithSol: Boolean(data.payWithSol),
      headerImageUrlPreview: truncate(data.headerImageUrl),
      hasCredentials: hasCredentials.bags(),
    },
  });

  if (result.stub) {
    // Stub orders are terminal at creation time — also write the paid audit.
    await audit({
      actorUserId: userId,
      action: "dexscreener.order_paid",
      targetType: "project",
      targetId: project.id,
      metadata: { orderUuid: result.orderUuid, stub: true },
    });
  }

  revalidatePath(`/dashboard/projects/${project.id}/token`);
  revalidatePath(`/r/${project.ghOwner}/${project.ghRepo}`);
  await updateProjectCaches(project.id, `${project.ghOwner}/${project.ghRepo}`);

  return result;
}

// ---------------------------------------------------------------------------
// submitDexscreenerPaymentAction
// ---------------------------------------------------------------------------

export type SubmitDexscreenerPaymentResult =
  | { ok: true; status: "paid" }
  | { ok: false; error: "not_found" | "wrong_state" | "submit_failed"; message?: string };

export async function submitDexscreenerPaymentAction(
  input: SubmitDexscreenerPaymentInput,
): Promise<SubmitDexscreenerPaymentResult> {
  // Auth-first: session before parse. The orderUuid is the routing key
  // for finding the project, so we extract a minimal shape to do the
  // initial DB lookup before running the full Zod validation.
  const userId = await requireSessionUserId();
  const orderUuidLookup = z
    .object({ orderUuid: z.string().min(1) })
    .parse(input).orderUuid;

  const [row] = await dbHttp
    .select({
      id: dexscreenerOrders.id,
      projectId: dexscreenerOrders.projectId,
      status: dexscreenerOrders.status,
    })
    .from(dexscreenerOrders)
    .where(eq(dexscreenerOrders.orderUuid, orderUuidLookup))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  await requirePermission("project.update", {
    userId,
    projectId: row.projectId,
  });

  // Full payload validation only after the caller is authorized to act
  // on this project.
  const data = SubmitDexscreenerPaymentInputSchema.parse(input);

  // `failed` is a terminal state — retries must create a fresh order
  // (the dashboard's "Retry order" button does this). Allowing
  // failed → paid would also race the partial unique index if a newer
  // active order exists for the same project.
  if (!["pending", "broadcast"].includes(row.status)) {
    return { ok: false, error: "wrong_state" };
  }

  // Idempotency anchor is the orderUuid itself — a network retry on the
  // same submission must NOT call Bags twice.
  const idemKey = deriveKey("dexscreener-submit", data.orderUuid);

  const result = await withIdempotency<SubmitDexscreenerPaymentResult>(
    idemKey,
    async () => {
      try {
        await bags.submitDexscreenerPayment({
          orderUUID: data.orderUuid,
          paymentSignature: data.paymentSignature,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Bags submitPayment failed";
        await dbHttp
          .update(dexscreenerOrders)
          .set({
            status: "failed",
            errorMessage: truncate(message),
            updatedAt: new Date(),
          })
          .where(eq(dexscreenerOrders.id, row.id));
        await audit({
          actorUserId: userId,
          action: "dexscreener.order_failed",
          targetType: "project",
          targetId: row.projectId,
          metadata: { orderUuid: data.orderUuid, error: truncate(message) },
        });
        return { ok: false, error: "submit_failed", message: truncate(message) };
      }

      await dbHttp
        .update(dexscreenerOrders)
        .set({
          status: "paid",
          paymentSignature: data.paymentSignature,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dexscreenerOrders.id, row.id));

      await audit({
        actorUserId: userId,
        action: "dexscreener.order_paid",
        targetType: "project",
        targetId: row.projectId,
        metadata: { orderUuid: data.orderUuid, stub: false },
      });
      return { ok: true, status: "paid" };
    },
    { scope: `project:dexscreener-submit:${row.projectId}` },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/projects/${row.projectId}/token`);
    await updateProjectCaches(row.projectId);
  }
  return result;
}

// ---------------------------------------------------------------------------
// cancelDexscreenerOrderAction — release the partial-unique-index slot when
// the client-side wallet flow aborts before broadcasting (user rejects the
// signature, wallet RPC fails, tab closes mid-sign, etc.). Without this
// the project is stuck in `pending` forever, since the create action's
// duplicate-order guard refuses to mint a fresh row while one is active.
// ---------------------------------------------------------------------------

const CancelDexscreenerOrderInputSchema = z.object({
  orderUuid: z.string().min(1),
  reason: z.string().max(280).optional(),
});

export type CancelDexscreenerOrderResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "wrong_state" };

export async function cancelDexscreenerOrderAction(
  input: z.input<typeof CancelDexscreenerOrderInputSchema>,
): Promise<CancelDexscreenerOrderResult> {
  const userId = await requireSessionUserId();
  const { orderUuid, reason } = CancelDexscreenerOrderInputSchema.parse(input);

  const [row] = await dbHttp
    .select({
      id: dexscreenerOrders.id,
      projectId: dexscreenerOrders.projectId,
      status: dexscreenerOrders.status,
    })
    .from(dexscreenerOrders)
    .where(eq(dexscreenerOrders.orderUuid, orderUuid))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  await requirePermission("project.update", {
    userId,
    projectId: row.projectId,
  });

  // Only `pending` rows can be cancelled — once we've broadcast the tx
  // we can't safely undo it from this side, and `paid`/`stub_paid`/
  // `failed` are all terminal.
  if (row.status !== "pending") {
    return { ok: false, error: "wrong_state" };
  }

  await dbHttp
    .update(dexscreenerOrders)
    .set({
      status: "failed",
      errorMessage: truncate(reason ?? "Cancelled by user before broadcast"),
      updatedAt: new Date(),
    })
    .where(eq(dexscreenerOrders.id, row.id));

  await audit({
    actorUserId: userId,
    action: "dexscreener.order_failed",
    targetType: "project",
    targetId: row.projectId,
    metadata: {
      orderUuid,
      cancelled: true,
      reason: truncate(reason ?? "client_abort"),
    },
  });

  revalidatePath(`/dashboard/projects/${row.projectId}/token`);
  await updateProjectCaches(row.projectId);
  return { ok: true };
}
