-- Migration: payment refund support (Phase E — Step 1)
--
-- 1. Add REFUNDED to the PaymentStatus enum.
--    PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
--    Prisma migrate deploy runs this file outside a transaction.
--    The IF NOT EXISTS guard makes it idempotent — safe to run more than once.
--    ⚠ Enum values CANNOT be removed from PostgreSQL after being added.
--    This is safe because no row will carry REFUNDED until a real charge.refunded
--    webhook fires; existing PENDING / PAID / FAILED / CANCELED rows are unaffected.
--
-- 2. Add four nullable refund columns to the Payment table.
--    All columns are NULL by default — fully backward-compatible.
--    No existing rows are modified; no data migrations are required.
--    Zero-downtime: Postgres adds nullable columns instantly without a table rewrite.
--
-- Rollback notes:
--    Column additions can be reversed with ALTER TABLE "Payment" DROP COLUMN.
--    The REFUNDED enum value cannot be removed from Postgres once added, but it
--    is completely inert until written to a row.

-- ── 1. Extend PaymentStatus enum ─────────────────────────────────────────────
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- ── 2. Add refund tracking columns to Payment ─────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAt"     TIMESTAMPTZ;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundAmount"   INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripeRefundId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReason"   TEXT;
