import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { dbHttp } from "@/db";
import {
  bagsClaimEvents,
  bagsClaimerSlots,
  bagsFeeShareConfigs,
} from "@/db/schema";
import { serverEnv, hasCredentials } from "@/lib/env";
import { audit } from "@/lib/audit";
import { captureException } from "@/lib/observability";
import { enterDbServiceContext } from "@/lib/db-rls";
import {
  parseBagsProgramEvents,
  type BagsProgramEvent,
} from "@/lib/bags/program-events";

export const maxDuration = 60;

/**
 * v1.1 — Helius enhanced webhook receiver for on-chain Bags fee-share-v2
 * events.
 *
 * Helius posts an array of transaction objects matching the watch we
 * configure in their dashboard (program id = FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK).
 * For each transaction, we extract the program logs, decode any v1.1-
 * relevant Anchor events (`BagsFeeShareUserClaimV2Event`,
 * `BagsFeeShareUserVaultClaimEvent`), and insert them into the
 * `bags_claim_events` ledger. The unique (tx_signature, log_index)
 * constraint makes re-delivery + the polling fallback safe to land
 * concurrently.
 *
 * Auth: shared bearer token (HELIUS_WEBHOOK_AUTH_TOKEN), constant-time
 * compared. No HMAC because Helius enhanced webhooks don't sign their
 * payloads — the bearer token is the only contract.
 */

const HeliusTxSchema = z.object({
  signature: z.string().min(64),
  slot: z.number().int().nonnegative().optional(),
  timestamp: z.number().int().nonnegative().optional(),
  meta: z
    .object({
      logMessages: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  // We accept and ignore everything else Helius sends — the parsed
  // `events` and `instructions` fields aren't useful for arbitrary
  // Anchor programs.
});
const HeliusBatchSchema = z.array(HeliusTxSchema);

type HeliusTx = z.infer<typeof HeliusTxSchema>;

interface IngestionResult {
  txCount: number;
  eventsParsed: number;
  eventsInserted: number;
  eventsSkipped: number;
  unmappedConfigs: string[];
}

export async function POST(req: Request): Promise<Response> {
  if (!authorize(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  enterDbServiceContext("webhook:helius:bags-events");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const parseResult = HeliusBatchSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parseResult.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  let result: IngestionResult;
  try {
    result = await ingestBatch(parseResult.data);
  } catch (e) {
    captureException(e, {
      area: "webhook.helius.bags-events",
      severity: "error",
    });
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }

  if (result.eventsInserted > 0 || result.unmappedConfigs.length > 0) {
    try {
      await audit({
        actorUserId: null,
        action: "bags.claim_events_ingested",
        targetType: "webhook",
        targetId: "helius:bags-events",
        metadata: {
          txCount: result.txCount,
          eventsParsed: result.eventsParsed,
          eventsInserted: result.eventsInserted,
          eventsSkipped: result.eventsSkipped,
          unmappedConfigs: result.unmappedConfigs,
        },
      });
    } catch {
      // Audit failures bubble up via captureException already; don't
      // 5xx the webhook caller for an audit-write hiccup.
    }
  }

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}

function authorize(req: Request): boolean {
  if (!hasCredentials.heliusWebhook()) return false;
  const expected = serverEnv().HELIUS_WEBHOOK_AUTH_TOKEN;
  if (!expected) return false;
  const provided =
    req.headers.get("authorization") ??
    req.headers.get("x-helius-auth") ??
    "";
  // Strip an optional "Bearer " prefix to match either header style.
  const presented = provided.replace(/^Bearer\s+/i, "");
  if (presented.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(presented, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

async function ingestBatch(txs: HeliusTx[]): Promise<IngestionResult> {
  const result: IngestionResult = {
    txCount: txs.length,
    eventsParsed: 0,
    eventsInserted: 0,
    eventsSkipped: 0,
    unmappedConfigs: [],
  };

  // Per-tx parse → flat list of (event, txSignature, logIndex). We track
  // logIndex by counting which "Program data:" line in this tx produced
  // the event so the (tx_signature, log_index) unique constraint is
  // stable across re-deliveries.
  type Pending = {
    txSignature: string;
    logIndex: number;
    blocktime: Date;
    event: BagsProgramEvent;
  };
  const pending: Pending[] = [];
  for (const tx of txs) {
    const logs = tx.meta?.logMessages ?? [];
    if (logs.length === 0) continue;
    const events = parseBagsProgramEvents(logs);
    result.eventsParsed += events.length;
    if (events.length === 0) continue;
    const blocktime = tx.timestamp
      ? new Date(tx.timestamp * 1000)
      : new Date();
    // Each parsed event consumed one "Program data:" line, in order.
    let logIndex = 0;
    for (const event of events) {
      pending.push({
        txSignature: tx.signature,
        logIndex,
        blocktime,
        event,
      });
      logIndex++;
    }
  }

  if (pending.length === 0) return result;

  // Batch-resolve fee-share-config + slot mapping for contributorId
  // population. We only need slots for the (config, claimerIndex) pairs
  // referenced by user_claim_v2 events.
  const configPdas = new Set<string>();
  for (const p of pending) {
    if (p.event.type === "user_claim_v2") {
      configPdas.add(p.event.data.feeShareConfig);
    }
  }
  const configRows =
    configPdas.size > 0
      ? await dbHttp
          .select({
            id: bagsFeeShareConfigs.id,
            pda: bagsFeeShareConfigs.feeShareConfigPda,
          })
          .from(bagsFeeShareConfigs)
          .where(
            inArray(
              bagsFeeShareConfigs.feeShareConfigPda,
              Array.from(configPdas),
            ),
          )
      : [];
  const configIdByPda = new Map(configRows.map((r) => [r.pda, r.id]));

  // Track configs we couldn't resolve so the audit row surfaces them.
  for (const pda of configPdas) {
    if (!configIdByPda.has(pda)) result.unmappedConfigs.push(pda);
  }

  // Look up slots for resolution: (configId, slotIndex) → contributorId.
  const slotKeys = new Set<string>();
  for (const p of pending) {
    if (p.event.type !== "user_claim_v2") continue;
    const configId = configIdByPda.get(p.event.data.feeShareConfig);
    if (!configId) continue;
    slotKeys.add(`${configId}:${p.event.data.claimerIndex}`);
  }
  const slotsByKey = new Map<string, string | null>();
  if (slotKeys.size > 0) {
    const slotRows = await dbHttp
      .select({
        configId: bagsClaimerSlots.feeShareConfigId,
        slotIndex: bagsClaimerSlots.slotIndex,
        contributorId: bagsClaimerSlots.contributorId,
      })
      .from(bagsClaimerSlots)
      .where(
        inArray(
          bagsClaimerSlots.feeShareConfigId,
          Array.from(configIdByPda.values()),
        ),
      );
    for (const row of slotRows) {
      slotsByKey.set(
        `${row.configId}:${row.slotIndex}`,
        row.contributorId,
      );
    }
  }

  // Build insert rows. user_vault_claim events don't have a
  // claimer_index in the IDL — we look up the config via baseMint
  // (added in a future enhancement; for now we insert with no
  // contributor mapping and a null claimer_index).
  type InsertRow = typeof bagsClaimEvents.$inferInsert;
  const rowsByConfigId = new Map<string, InsertRow[]>();
  for (const p of pending) {
    let configId: string | undefined;
    let contributorId: string | null = null;
    let claimerIndex: number | null = null;
    let userPubkey: string;
    let lamports: bigint;
    let forceClaimExecutor: string | null = null;
    let forceClaimType: string | null = null;
    let kind: "user_claim_v2" | "user_vault_claim";

    if (p.event.type === "user_claim_v2") {
      configId = configIdByPda.get(p.event.data.feeShareConfig);
      if (!configId) {
        result.eventsSkipped++;
        continue;
      }
      kind = "user_claim_v2";
      userPubkey = p.event.data.user;
      claimerIndex = p.event.data.claimerIndex;
      lamports = p.event.data.claimed;
      forceClaimExecutor = p.event.data.forceClaimExecutor;
      forceClaimType = p.event.data.forceClaimType;
      contributorId =
        slotsByKey.get(`${configId}:${claimerIndex}`) ?? null;
    } else if (p.event.type === "user_vault_claim") {
      // Vault claims have no fee_share_config in the event — we can't
      // map them to a config from the event alone. Skip in v1.1 (we
      // don't currently use force_claim_user_to_vault) and revisit in
      // a follow-up if vault flows become part of the product.
      result.eventsSkipped++;
      continue;
    } else {
      // Other event variants (fee_config_updated, snapshot) are
      // observed via different ingest paths.
      result.eventsSkipped++;
      continue;
    }

    const row: InsertRow = {
      feeShareConfigId: configId,
      contributorId,
      kind,
      txSignature: p.txSignature,
      logIndex: p.logIndex,
      blocktime: p.blocktime,
      userPubkey,
      claimerIndex,
      lamports,
      forceClaimExecutor,
      forceClaimType,
      ingestSource: "webhook",
    };
    const list = rowsByConfigId.get(configId) ?? [];
    list.push(row);
    rowsByConfigId.set(configId, list);
  }

  // Insert per config (helps with FK ordering should anything fail
  // in a future RLS-aware path; also keeps the batch sizes bounded).
  for (const rows of rowsByConfigId.values()) {
    if (rows.length === 0) continue;
    const inserted = await dbHttp
      .insert(bagsClaimEvents)
      .values(rows)
      .onConflictDoNothing({
        target: [bagsClaimEvents.txSignature, bagsClaimEvents.logIndex],
      })
      .returning({ id: bagsClaimEvents.id });
    result.eventsInserted += inserted.length;
    result.eventsSkipped += rows.length - inserted.length;
  }

  return result;
}
