ALTER TYPE "public"."partner_fee_claim_status" ADD VALUE IF NOT EXISTS 'skipped';

ALTER TABLE "projects"
  ALTER COLUMN "platform_fee_bps" SET DEFAULT 0;
