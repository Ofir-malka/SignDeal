-- Migration: add the MONTHS value to RentalCommissionMode
--
-- MONTHS = the broker chose a number of monthly rents (1-12) as the rental
-- brokerage fee; the chosen count is persisted in Contract.rentalCommissionMonths
-- (added by the follow-up migration). Required by the INTERESTED v2 rental/BOTH
-- templates' dynamic rental-fee clause.
--
-- ALTER TYPE ... ADD VALUE on an EXISTING enum cannot run in the same
-- transaction as statements that use the new value, so it is intentionally
-- isolated as the only statement of this migration.
--
-- IF NOT EXISTS makes this a safe no-op on databases where the value was
-- already added by an equivalent dev-branch migration.

ALTER TYPE "RentalCommissionMode" ADD VALUE IF NOT EXISTS 'MONTHS';
