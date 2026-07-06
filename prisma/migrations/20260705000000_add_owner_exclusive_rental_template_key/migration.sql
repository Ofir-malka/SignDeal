-- Migration: add OWNER_EXCLUSIVE_RENTAL to the ContractTemplateKey enum
--
-- First owner-exclusive variant: exclusive rental marketing mandate. Resolved by
-- (contractType = "החתמת בעל נכס / בלעדיות", dealType = RENTAL) -> OWNER_EXCLUSIVE_RENTAL.
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this,
-- Prisma v5+ runs enum additions outside the wrapping transaction automatically).
-- If running manually via psql, run it outside a BEGIN/COMMIT block:
--   psql $DATABASE_URL -f migration.sql
--
-- Additive only — no existing rows are affected. The IF NOT EXISTS guard makes
-- this idempotent. Enum values cannot be dropped in PostgreSQL, so rollback is a
-- forward migration; the unused value is harmless.

ALTER TYPE "ContractTemplateKey" ADD VALUE IF NOT EXISTS 'OWNER_EXCLUSIVE_RENTAL';
