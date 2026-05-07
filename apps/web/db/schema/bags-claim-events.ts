import {
  pgEnum,
  pgTable,
  text,
  integer,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { bagsFeeShareConfigs } from "./bags-fee-share";
import { contributors } from "./contributors";
import { createId } from "@repo/lib";

/**
 * Append-only ledger of on-chain Bags claim events.
 *
 * Source of truth: `BagsFeeShareUserClaimV2Event` and
 * `BagsFeeShareUserVaultClaimEvent` emitted by the fee-share-v2 program.
 * Ingested via Helius enhanced webhooks (primary) and a polling cron
 * (fallback). Used by the leaderboard "claim event feed" component, the
 * reconciliation drift checker, and per-contributor lifetime totals.
 *
 * Idempotency: (tx_signature, log_index) is unique. Same tx is safe to
 * re-ingest from the polling fallback after webhook delivery.
 */

export const bagsClaimEventKindEnum = pgEnum("bags_claim_event_kind", [
  "user_claim_v2",
  "user_vault_claim",
]);

export const bagsClaimIngestSourceEnum = pgEnum("bags_claim_ingest_source", [
  "webhook",
  "polling",
  "backfill",
]);

export const bagsClaimEvents = pgTable(
  "bags_claim_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    feeShareConfigId: text("fee_share_config_id")
      .notNull()
      .references(() => bagsFeeShareConfigs.id, { onDelete: "restrict" }),
    /**
     * Optional FK to our internal contributor record, resolved by joining
     * the on-chain `user` pubkey against `bags_claimer_slots.claimer_pubkey`
     * → `contributor_id`. Null when we cannot map the pubkey (raw wallet
     * claimer, or a slot we never indexed).
     */
    contributorId: text("contributor_id").references(() => contributors.id, {
      onDelete: "set null",
    }),

    kind: bagsClaimEventKindEnum("kind").notNull(),

    /** Solana transaction signature that emitted this event. */
    txSignature: text("tx_signature").notNull(),
    /**
     * Index of this event within the tx's program logs. A single tx can
     * emit multiple claim events (e.g. batch claims), so the unique
     * constraint is on (tx_signature, log_index), not tx_signature alone.
     */
    logIndex: integer("log_index").notNull(),

    /** Unix timestamp from the event payload (not block time). */
    blocktime: timestamp("blocktime", { withTimezone: true }).notNull(),

    // --- Payload fields (mirrors BagsFeeShareUserClaimV2EventData) ---
    /** Claimer's on-chain pubkey (the slot owner who received the SOL). */
    userPubkey: text("user_pubkey").notNull(),
    /**
     * For user_claim_v2: the `claimer_index` from the event. For
     * user_vault_claim: null (vault claims aren't slot-indexed).
     */
    claimerIndex: integer("claimer_index"),
    /** Lamports transferred to the claimer (or to their vault). */
    lamports: bigint("lamports", { mode: "bigint" }).notNull(),
    /**
     * For force-claims: the executor pubkey (admin or manager). Null on
     * user-initiated claims.
     */
    forceClaimExecutor: text("force_claim_executor"),
    /** Variant name for force-claims, null otherwise. */
    forceClaimType: text("force_claim_type"),

    /** How we ingested this event. */
    ingestSource: bagsClaimIngestSourceEnum("ingest_source").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /**
     * (tx_signature, log_index) is the natural primary key for an Anchor
     * event. Enforced as a unique index so polling-fallback never inserts
     * duplicates after the webhook has already delivered.
     */
    txLogUnique: uniqueIndex("bags_claim_events_tx_log_unique").on(
      t.txSignature,
      t.logIndex,
    ),
    configIdx: index("bags_claim_events_config_idx").on(t.feeShareConfigId),
    /**
     * Per-contributor lifetime queries — leaderboard "you've claimed N SOL
     * from M projects since launch" — hit this index.
     */
    contributorIdx: index("bags_claim_events_contributor_idx").on(
      t.contributorId,
    ),
    /** Recent claims feed across all projects: ORDER BY blocktime DESC. */
    blocktimeIdx: index("bags_claim_events_blocktime_idx").on(t.blocktime),
    /** Per-pubkey lookup (for rows where contributorId is null). */
    userPubkeyIdx: index("bags_claim_events_user_pubkey_idx").on(t.userPubkey),
  }),
);
