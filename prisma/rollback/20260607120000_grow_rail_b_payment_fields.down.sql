-- ============================================================================
-- ROLLBACK (compensating / down migration) for:
--   20260607120000_grow_rail_b_payment_fields
--
-- Prisma migrations are forward-only; this hand-authored script reverses the
-- forward migration exactly. NOT auto-applied — run manually only if undoing.
--
-- The forward migration is additive (4 nullable columns on Payment), so dropping
-- them is safe. The Grow Rail B payment path is flag-gated (GROW_PAYMENTS_ENABLED,
-- default false), so in normal operation these columns are empty.
-- After a manual rollback, also delete the _prisma_migrations row for
-- 20260607120000_grow_rail_b_payment_fields so `prisma migrate status` stays consistent.
-- ============================================================================

-- AlterTable (reverse order of create)
ALTER TABLE "Payment" DROP COLUMN "growRaw",
DROP COLUMN "growAsmachta",
DROP COLUMN "growTransactionToken",
DROP COLUMN "growProcessToken";
