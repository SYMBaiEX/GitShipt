import {
  pgEnum,
  pgTable,
  text,
  bigint,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@repo/lib";

export const partnerFeeClaimStatusEnum = pgEnum("partner_fee_claim_status", [
  "pending",
  "sending",
  "succeeded",
  "failed",
  "review",
  "skipped",
]);

export const fundReconciliationStatusEnum = pgEnum(
  "fund_reconciliation_status",
  ["clean", "warning", "critical"],
);

export interface PartnerClaimStatsJson {
  claimedFees: string;
  unclaimedFees: string;
}

export interface FundReconciliationIssueJson {
  severity: "warning" | "critical";
  code: string;
  message: string;
  referenceId?: string;
  amountLamports?: string;
}

export const partnerFeeClaimAttempts = pgTable(
  "partner_fee_claim_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    partnerWallet: text("partner_wallet").notNull(),
    partnerConfigKey: text("partner_config_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: partnerFeeClaimStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    beforeStats: jsonb("before_stats")
      .$type<PartnerClaimStatsJson | null>()
      .default(null),
    afterStats: jsonb("after_stats")
      .$type<PartnerClaimStatsJson | null>()
      .default(null),
    signatures: jsonb("signatures").$type<string[]>().notNull().default([]),
    claimedDeltaLamports: bigint("claimed_delta_lamports", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    unclaimedDeltaLamports: bigint("unclaimed_delta_lamports", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idempotencyUq: uniqueIndex("partner_fee_claim_idempotency_uq").on(
      t.idempotencyKey,
    ),
    statusIdx: index("partner_fee_claim_status_idx").on(t.status),
    walletIdx: index("partner_fee_claim_wallet_idx").on(t.partnerWallet),
  }),
);

export const fundReconciliationRuns = pgTable(
  "fund_reconciliation_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    status: fundReconciliationStatusEnum("status").notNull().default("clean"),
    hotWalletAddress: text("hot_wallet_address"),
    hotWalletBalanceLamports: bigint("hot_wallet_balance_lamports", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    escrowLiabilityLamports: bigint("escrow_liability_lamports", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    unsettledRecipientLamports: bigint("unsettled_recipient_lamports", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    manualReviewCount: integer("manual_review_count").notNull().default(0),
    finalizedSignatureCount: integer("finalized_signature_count")
      .notNull()
      .default(0),
    staleSignatureCount: integer("stale_signature_count").notNull().default(0),
    issues: jsonb("issues")
      .$type<FundReconciliationIssueJson[]>()
      .notNull()
      .default([]),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    checkedIdx: index("fund_reconciliation_checked_idx").on(t.checkedAt),
    statusIdx: index("fund_reconciliation_status_idx").on(t.status),
  }),
);
