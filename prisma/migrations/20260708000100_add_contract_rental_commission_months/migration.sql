-- Migration: persist the chosen number of monthly rents (Contract.rentalCommissionMonths)
--
-- 1-12; set only when rentalCommissionMode = MONTHS. Lets the dynamic rental
-- fee clause of the INTERESTED v2 rental/BOTH templates state the chosen count
-- deterministically, both at creation and on signing-route regeneration.
--
-- Nullable — PostgreSQL adds a nullable column instantly, no table rewrite.
-- Backward-compatible: every existing row stays NULL.
-- IF NOT EXISTS makes this a safe no-op on databases where the column was
-- already added by an equivalent dev-branch migration.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "rentalCommissionMonths" INTEGER;
