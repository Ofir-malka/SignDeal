-- migration: 20260505200000_fee_model
-- Adds fee percentage snapshot fields to Payment.
-- No renames. No backfills. Existing rows get defaults automatically.

ALTER TABLE "Payment" ADD COLUMN "providerFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
