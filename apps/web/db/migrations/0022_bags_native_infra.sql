CREATE TYPE "public"."bags_claim_event_kind" AS ENUM('user_claim_v2', 'user_vault_claim');--> statement-breakpoint
CREATE TYPE "public"."bags_claim_ingest_source" AS ENUM('webhook', 'polling', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."bags_claimer_provider" AS ENUM('github', 'twitter', 'kick', 'tiktok', 'moltbook', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."bags_rebalance_status" AS ENUM('pending', 'signing', 'broadcasting', 'confirmed', 'failed', 'skipped');--> statement-breakpoint
-- Note: dexscreener_order_status enum + dexscreener_orders table already
-- exist from migration 0021_dexscreener_orders. The drizzle-kit generator
-- re-emits them here because the meta/0021_snapshot.json is missing from
-- the repo. Stripped to prevent "type already exists" / "relation already
-- exists" errors during apply. The journal already records 0021 as
-- applied, so this is purely a snapshot-state recovery.
CREATE TYPE "public"."payout_schedule_status" AS ENUM('pending_first_run', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "bags_claim_events" (
	"id" text PRIMARY KEY NOT NULL,
	"fee_share_config_id" text NOT NULL,
	"contributor_id" text,
	"kind" "bags_claim_event_kind" NOT NULL,
	"tx_signature" text NOT NULL,
	"log_index" integer NOT NULL,
	"blocktime" timestamp with time zone NOT NULL,
	"user_pubkey" text NOT NULL,
	"claimer_index" integer,
	"lamports" bigint NOT NULL,
	"force_claim_executor" text,
	"force_claim_type" text,
	"ingest_source" "bags_claim_ingest_source" NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bags_claimer_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"fee_share_config_id" text NOT NULL,
	"slot_index" integer NOT NULL,
	"claimer_pubkey" text NOT NULL,
	"provider" "bags_claimer_provider" NOT NULL,
	"social_handle" text,
	"contributor_id" text,
	"initial_bps" integer NOT NULL,
	"current_bps" integer NOT NULL,
	"last_bps_update_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bags_fee_share_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"base_mint" text NOT NULL,
	"quote_mint" text NOT NULL,
	"fee_share_config_pda" text NOT NULL,
	"fee_share_authority_pda" text NOT NULL,
	"admin_pubkey" text NOT NULL,
	"manager_pubkey" text,
	"manager_delegated_at" timestamp with time zone,
	"manager_delegation_tx_signature" text,
	"claimer_count" integer NOT NULL,
	"is_init_finalized" boolean DEFAULT false NOT NULL,
	"is_update_locked" boolean DEFAULT false NOT NULL,
	"is_update_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bags_rebalance_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"fee_share_config_id" text NOT NULL,
	"snapshot_id" text,
	"snapshot_period" text NOT NULL,
	"plan_hash" text NOT NULL,
	"plan" jsonb NOT NULL,
	"status" "bags_rebalance_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"signatures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- (dexscreener_orders table already exists from 0021; see note above.)
CREATE TABLE "payout_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"steady_state_cadence_hours" integer NOT NULL,
	"status" "payout_schedule_status" DEFAULT 'pending_first_run' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_tx_signature" text,
	"total_rebalances" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_reason" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bags_claim_events" ADD CONSTRAINT "bags_claim_events_fee_share_config_id_bags_fee_share_configs_id_fk" FOREIGN KEY ("fee_share_config_id") REFERENCES "public"."bags_fee_share_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_claim_events" ADD CONSTRAINT "bags_claim_events_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_claimer_slots" ADD CONSTRAINT "bags_claimer_slots_fee_share_config_id_bags_fee_share_configs_id_fk" FOREIGN KEY ("fee_share_config_id") REFERENCES "public"."bags_fee_share_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_claimer_slots" ADD CONSTRAINT "bags_claimer_slots_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_fee_share_configs" ADD CONSTRAINT "bags_fee_share_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_rebalance_attempts" ADD CONSTRAINT "bags_rebalance_attempts_fee_share_config_id_bags_fee_share_configs_id_fk" FOREIGN KEY ("fee_share_config_id") REFERENCES "public"."bags_fee_share_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bags_rebalance_attempts" ADD CONSTRAINT "bags_rebalance_attempts_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- (dexscreener_orders FK already exists from 0021.)
ALTER TABLE "payout_schedules" ADD CONSTRAINT "payout_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bags_claim_events_tx_log_unique" ON "bags_claim_events" USING btree ("tx_signature","log_index");--> statement-breakpoint
CREATE INDEX "bags_claim_events_config_idx" ON "bags_claim_events" USING btree ("fee_share_config_id");--> statement-breakpoint
CREATE INDEX "bags_claim_events_contributor_idx" ON "bags_claim_events" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "bags_claim_events_blocktime_idx" ON "bags_claim_events" USING btree ("blocktime");--> statement-breakpoint
CREATE INDEX "bags_claim_events_user_pubkey_idx" ON "bags_claim_events" USING btree ("user_pubkey");--> statement-breakpoint
CREATE UNIQUE INDEX "bags_claimer_slots_config_slot_unique" ON "bags_claimer_slots" USING btree ("fee_share_config_id","slot_index");--> statement-breakpoint
CREATE INDEX "bags_claimer_slots_config_idx" ON "bags_claimer_slots" USING btree ("fee_share_config_id");--> statement-breakpoint
CREATE INDEX "bags_claimer_slots_contributor_idx" ON "bags_claimer_slots" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "bags_claimer_slots_claimer_pubkey_idx" ON "bags_claimer_slots" USING btree ("claimer_pubkey");--> statement-breakpoint
CREATE UNIQUE INDEX "bags_fee_share_configs_project_unique" ON "bags_fee_share_configs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bags_fee_share_configs_base_mint_unique" ON "bags_fee_share_configs" USING btree ("base_mint");--> statement-breakpoint
CREATE UNIQUE INDEX "bags_fee_share_configs_pda_unique" ON "bags_fee_share_configs" USING btree ("fee_share_config_pda");--> statement-breakpoint
CREATE INDEX "bags_rebalance_attempts_config_idx" ON "bags_rebalance_attempts" USING btree ("fee_share_config_id");--> statement-breakpoint
CREATE INDEX "bags_rebalance_attempts_snapshot_idx" ON "bags_rebalance_attempts" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "bags_rebalance_attempts_status_idx" ON "bags_rebalance_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bags_rebalance_attempts_plan_unique" ON "bags_rebalance_attempts" USING btree ("fee_share_config_id","plan_hash");--> statement-breakpoint
-- (dexscreener_orders indexes already exist from 0021.)
CREATE UNIQUE INDEX "payout_schedules_project_unique" ON "payout_schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payout_schedules_next_run_ready_idx" ON "payout_schedules" USING btree ("next_run_at") WHERE paused_at IS NULL AND archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "payout_schedules_status_idx" ON "payout_schedules" USING btree ("status");