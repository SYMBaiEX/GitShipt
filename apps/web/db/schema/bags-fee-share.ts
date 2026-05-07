import {
  pgEnum,
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { contributors } from "./contributors";
import { snapshots } from "./snapshots";
import { createId } from "@repo/lib";

/**
 * v1.1 — On-chain fee-share-v2 config mirror, claimer slots, and rebalance
 * attempt ledger.
 *
 * Architecture: GitShipt holds the on-chain MANAGER role per project,
 * delegated by the project owner (admin) immediately after launch via
 * `update_fee_config_manager`. The manager keypair signs cadence-driven
 * `manager_update_fee_config` BPS rebalances; contributors claim fees
 * directly through Bags' GitHub-OAuth UI. See
 * docs/adr/0001-bags-native-payout.md.
 *
 * Tables:
 *  - bags_fee_share_configs — one row per launched token; mirrors the
 *    on-chain FeeShareConfig PDA + tracks the manager role state.
 *  - bags_claimer_slots — one row per claimer; the immutable on-chain
 *    pubkey and its current BPS weight.
 *  - bags_rebalance_attempts — durable ledger of every BPS rebalance
 *    transaction (signed by the manager keypair). Reserved before
 *    signing, finalized after broadcast.
 */

// --- bags_fee_share_configs -----------------------------------------------

export const bagsClaimerProviderEnum = pgEnum("bags_claimer_provider", [
  "github",
  "twitter",
  "kick",
  "tiktok",
  "moltbook",
  "wallet",
]);

export const bagsFeeShareConfigs = pgTable(
  "bags_fee_share_configs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Token base mint (the project's token). */
    baseMint: text("base_mint").notNull(),
    /** Quote mint — currently always WSOL per the on-chain program. */
    quoteMint: text("quote_mint").notNull(),
    /**
     * The on-chain `fee_share_config` PDA derived from
     * `["fee_share_config", base_mint, quote_mint]` under program
     * `FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK`. Persisted explicitly
     * so we don't re-derive on every workflow read.
     */
    feeShareConfigPda: text("fee_share_config_pda").notNull(),
    /** The on-chain `fee_share_authority` PDA (same seeds, different prefix). */
    feeShareAuthorityPda: text("fee_share_authority_pda").notNull(),

    /** Admin pubkey — the project owner / launching wallet. */
    adminPubkey: text("admin_pubkey").notNull(),
    /**
     * Manager pubkey — GitShipt's `SOLANA_MANAGER_KEYPAIR`. Null until the
     * project owner signs the `update_fee_config_manager` ix; populated
     * once the launch flow's manager-delegation step confirms.
     */
    managerPubkey: text("manager_pubkey"),
    managerDelegatedAt: timestamp("manager_delegated_at", {
      withTimezone: true,
    }),
    managerDelegationTxSignature: text("manager_delegation_tx_signature"),

    /** Number of claimer slots at launch (immutable post-finalize). */
    claimerCount: integer("claimer_count").notNull(),
    /**
     * Reflects the on-chain `is_init_finalized` flag. Once true, no new
     * slots can be added — the only permitted on-chain change is BPS
     * rebalancing within the existing slot range.
     */
    isInitFinalized: boolean("is_init_finalized").notNull().default(false),
    /**
     * Reflects the on-chain `is_update_locked` flag (transient — set true
     * during a multi-tx update sequence, cleared when finalize_update lands).
     * Workflows must refuse to claim or rebalance while this is true.
     */
    isUpdateLocked: boolean("is_update_locked").notNull().default(false),
    /**
     * Reflects whether the on-chain config's `update_fee_config` was ever
     * called with `finalize_update=true`. Permanent. Once this flag is set
     * the manager can no longer rebalance and the project is effectively
     * frozen at its current BPS weights.
     */
    isUpdateFinalized: boolean("is_update_finalized").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectUnique: uniqueIndex("bags_fee_share_configs_project_unique").on(
      t.projectId,
    ),
    baseMintUnique: uniqueIndex("bags_fee_share_configs_base_mint_unique").on(
      t.baseMint,
    ),
    pdaUnique: uniqueIndex("bags_fee_share_configs_pda_unique").on(
      t.feeShareConfigPda,
    ),
  }),
);

// --- bags_claimer_slots ----------------------------------------------------

export const bagsClaimerSlots = pgTable(
  "bags_claimer_slots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    feeShareConfigId: text("fee_share_config_id")
      .notNull()
      .references(() => bagsFeeShareConfigs.id, { onDelete: "cascade" }),
    /** 0..99 slot index, immutable for the life of the config. */
    slotIndex: integer("slot_index").notNull(),

    /**
     * The on-chain pubkey at this slot. For social-handle claimers this is
     * a Bags-managed PDA (immutable, tied to Bags' internal user record).
     * For raw wallet claimers it's whatever pubkey the launcher specified.
     * Either way, this is what the on-chain program stores in its
     * `claimers: pubkey[]` array — it cannot be changed post-finalize.
     */
    claimerPubkey: text("claimer_pubkey").notNull(),

    /** Provider used to resolve this claimer at launch (or "wallet"). */
    provider: bagsClaimerProviderEnum("provider").notNull(),
    /**
     * Social handle if `provider` is a social provider; null when
     * `provider = 'wallet'` (the launcher specified a raw pubkey directly).
     */
    socialHandle: text("social_handle"),
    /**
     * Optional FK to our internal contributor record. Populated when we
     * recognize the social handle in our GitHub indexer. Null for raw
     * wallet claimers and for social handles that don't match a tracked
     * contributor.
     */
    contributorId: text("contributor_id").references(() => contributors.id, {
      onDelete: "set null",
    }),

    /** BPS weight set at launch time. Captured for audit. */
    initialBps: integer("initial_bps").notNull(),
    /** Current BPS weight; updated after each manager rebalance. */
    currentBps: integer("current_bps").notNull(),
    lastBpsUpdateAt: timestamp("last_bps_update_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /**
     * Slot index is unique per config — the on-chain `claimers` array is
     * 0-indexed and dense; this constraint catches drift between our
     * mirror and chain state.
     */
    configSlotUnique: uniqueIndex("bags_claimer_slots_config_slot_unique").on(
      t.feeShareConfigId,
      t.slotIndex,
    ),
    configIdx: index("bags_claimer_slots_config_idx").on(t.feeShareConfigId),
    contributorIdx: index("bags_claimer_slots_contributor_idx").on(
      t.contributorId,
    ),
    claimerPubkeyIdx: index("bags_claimer_slots_claimer_pubkey_idx").on(
      t.claimerPubkey,
    ),
  }),
);

// --- bags_rebalance_attempts ----------------------------------------------

export const bagsRebalanceStatusEnum = pgEnum("bags_rebalance_status", [
  "pending",
  "signing",
  "broadcasting",
  "confirmed",
  "failed",
  "skipped",
]);

/**
 * BPS plan persisted with a rebalance attempt: the new BPS weights aligned
 * to claimer slot indices (so callers don't have to re-correlate). The full
 * set is stored even though the on-chain ix takes a [from_idx, to_idx]
 * range — slot N's `bps[N]` MUST be reproducible from this row.
 */
export interface BagsRebalancePlanJson {
  /** Length must equal claimer_count of the parent config. */
  bps: number[];
  /** Slot range [fromIdx, toIdx] passed to manager_update_fee_config. */
  fromIdx: number;
  toIdx: number;
  /** Always false in v1.1 — finalizing locks rebalancing forever. */
  finalizeUpdate: boolean;
  /** Whether the plan crossed the LUT threshold (>15 claimers). */
  requiresLookupTables: boolean;
}

export const bagsRebalanceAttempts = pgTable(
  "bags_rebalance_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    feeShareConfigId: text("fee_share_config_id")
      .notNull()
      .references(() => bagsFeeShareConfigs.id, { onDelete: "cascade" }),
    /** Optional FK to the snapshot whose ranking drove this rebalance. */
    snapshotId: text("snapshot_id").references(() => snapshots.id, {
      onDelete: "set null",
    }),
    /** Snapshot period (e.g. "2026-05-06") — denormalized for indexing. */
    snapshotPeriod: text("snapshot_period").notNull(),

    /**
     * Hash of the BPS plan + slot range. Used as the manager_update_fee_config
     * idempotency key and to dedupe identical plans across retries.
     */
    planHash: text("plan_hash").notNull(),
    plan: jsonb("plan").$type<BagsRebalancePlanJson>().notNull(),

    status: bagsRebalanceStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    /** Tx signatures, one per LUT segment (usually a single entry). */
    signatures: jsonb("signatures").$type<string[]>().notNull().default([]),
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    configIdx: index("bags_rebalance_attempts_config_idx").on(
      t.feeShareConfigId,
    ),
    snapshotIdx: index("bags_rebalance_attempts_snapshot_idx").on(t.snapshotId),
    statusIdx: index("bags_rebalance_attempts_status_idx").on(t.status),
    /** Idempotent retries: same config + plan hash should not double-execute. */
    planUnique: uniqueIndex("bags_rebalance_attempts_plan_unique").on(
      t.feeShareConfigId,
      t.planHash,
    ),
  }),
);

