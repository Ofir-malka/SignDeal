-- ============================================================================
-- Migration: 20260607120000_grow_rail_b_payment_fields
-- Rail B (Client → Broker) Grow payments — Step 1 additive fields on Payment.
--
-- ADDITIVE ONLY: 4 nullable columns. No data modified, no drops, no NOT NULL on
-- existing rows. These are written only by the Grow Rail B payment path, which is
-- gated behind GROW_PAYMENTS_ENABLED (default false) AND GrowBrokerMerchant.isActive.
--
--   growProcessToken     — stored at create (Step 1, createPaymentProcess)
--   growTransactionToken — set by the payment webhook (Step 2)
--   growAsmachta         — approval code, set by the webhook (Step 2)
--   growRaw              — raw verified response snapshot, audit (Step 2)
--
-- NOTE: must be applied to every environment running the new schema BEFORE the
-- code deploys — Prisma's default full-row Payment selects reference these columns.
-- ============================================================================

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "growProcessToken" TEXT,
ADD COLUMN     "growTransactionToken" TEXT,
ADD COLUMN     "growAsmachta" TEXT,
ADD COLUMN     "growRaw" TEXT;
