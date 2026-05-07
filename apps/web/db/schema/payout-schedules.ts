import {
  pgEnum,
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { createId } from "@repo/lib";

/**
 * v1.1 — Per-project cadence state for the Bags-native rebalance workflow.
 *
 * Cadence sequence per project:
 *   - Run 1: scheduled for `launchedAt + 24h` (gives early gratification)
 *   - Run 2: scheduled for `run1At + 72h` (3 days, lets activity settle)
 *   - Run N >= 3: scheduled for `lastRunAt + steadyStateCadenceHours`
 *
 * The 24h-then-3d ramp-up is hard-coded in the workflow. Only the
 * steady-state cadence is per-project configurable (3/5/7 days).
 *
 * Cron picks up rows whose `next_run_at <= now()` AND `paused_at IS NULL`
 * AND `archived_at IS NULL`.
 */

export const payoutScheduleStatusEnum = pgEnum("payout_schedule_status", [
  "pending_first_run",
  "active",
  "paused",
  "archived",
]);

export const payoutSchedules = pgTable(
  "payout_schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /**
     * Steady-state cadence in hours, picked by the launcher and adjustable
     * from project settings. Currently restricted to 72 (3d), 120 (5d),
     * or 168 (7d) by application logic — the column is plain integer so
     * future cadences don't require a migration.
     */
    steadyStateCadenceHours: integer("steady_state_cadence_hours").notNull(),

    status: payoutScheduleStatusEnum("status")
      .notNull()
      .default("pending_first_run"),

    /** When the first rebalance is due. Set at launch confirmation. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    /** Most recent rebalance — null until the first run completes. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** Tx signature of the most recent successful rebalance. */
    lastRunTxSignature: text("last_run_tx_signature"),
    /** Total rebalances confirmed on-chain (drives the ramp-up sequence). */
    totalRebalances: integer("total_rebalances").notNull().default(0),

    /**
     * When the schedule was paused (manual operator action, kill switch, or
     * because the on-chain config is in an unrecoverable state). Set null
     * to resume.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedReason: text("paused_reason"),

    /**
     * Set when the project owner ends the schedule entirely (e.g. after
     * calling manager_waive_fee_config to return manager role to admin).
     * Archived schedules never run again.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectUnique: uniqueIndex("payout_schedules_project_unique").on(
      t.projectId,
    ),
    /**
     * Partial index over rows the cron should consider — keeps the
     * scheduler scan tight even at thousands of projects.
     */
    nextRunReadyIdx: index("payout_schedules_next_run_ready_idx")
      .on(t.nextRunAt)
      .where(sql`paused_at IS NULL AND archived_at IS NULL`),
    statusIdx: index("payout_schedules_status_idx").on(t.status),
  }),
);
