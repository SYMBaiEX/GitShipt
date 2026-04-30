-- DexScreener Enhanced Token Info — order tracking
--
-- Tracks paid orders for the DexScreener Enhanced Token Info upgrade,
-- which Bags.fm brokers via `sdk.dexscreener.*`. Each row represents one
-- attempt by a project owner to upgrade their token's DexScreener page
-- (logo, header image, description, social links) for $299 USDC (or SOL
-- equivalent via `payWithSol`).
--
-- Status lifecycle:
--   pending      — order created with Bags, server tx blob stored,
--                  user has not yet signed/broadcast
--   broadcast    — payment tx broadcast on-chain, awaiting Bags submission
--   paid         — Bags confirmed payment; the token's DexScreener page is
--                  now upgraded
--   failed       — Bags rejected payment or signing failed; row may be
--                  retried from a fresh order
--   stub_paid    — written when Bags credentials are absent so dev/E2E can
--                  walk the flow without on-chain side effects
--
-- A partial unique index keeps at most one *open or completed* order per
-- project (`pending`, `broadcast`, `paid`, `stub_paid`); rows in `failed`
-- may coexist so a retry can create a new pending row alongside the
-- terminal failure record.

DO $$ BEGIN
  CREATE TYPE "public"."dexscreener_order_status" AS ENUM (
    'pending', 'broadcast', 'paid', 'failed', 'stub_paid'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dexscreener_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "token_mint" text NOT NULL,
  "order_uuid" text NOT NULL,
  "recipient_wallet" text NOT NULL,
  "payer_wallet" text NOT NULL,
  "price_usdc" numeric(12,2) NOT NULL,
  "pay_with_sol" boolean NOT NULL DEFAULT false,
  "description" text NOT NULL,
  "icon_image_url" text NOT NULL,
  "header_image_url" text NOT NULL,
  "links" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_valid_block_height" integer NOT NULL,
  "bags_transaction_blob" text,
  "payment_signature" text,
  "status" "dexscreener_order_status" NOT NULL DEFAULT 'pending',
  "stub" boolean NOT NULL DEFAULT false,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "paid_at" timestamp with time zone
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "dexscreener_orders"
    ADD CONSTRAINT "dexscreener_orders_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "dexscreener_orders_order_uuid_unique"
  ON "dexscreener_orders" ("order_uuid");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "dexscreener_orders_project_active_unique"
  ON "dexscreener_orders" ("project_id")
  WHERE "status" IN ('pending', 'broadcast', 'paid', 'stub_paid');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dexscreener_orders_project_created_idx"
  ON "dexscreener_orders" ("project_id", "created_at" DESC);
