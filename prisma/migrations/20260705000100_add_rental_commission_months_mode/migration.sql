-- Migration: add MONTHS to the RentalCommissionMode enum
--
-- Owner-exclusive rental contracts let the broker set the fee as a number of
-- monthly rents (1-12). The count itself lives in Contract.rentalCommissionMonths
-- (separate migration); this value marks that mode. The existing ONE_MONTH and
-- FIXED values (interested-client flows) are unaffected.
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this).
-- If running manually via psql, run it outside a BEGIN/COMMIT block.
--
-- Additive only — no existing rows are affected. The IF NOT EXISTS guard makes
-- this idempotent. Rollback is a forward migration; the unused value is harmless.

ALTER TYPE "RentalCommissionMode" ADD VALUE IF NOT EXISTS 'MONTHS';
