-- Migration: add INTERESTED_BUYER_BOTH to the ContractTemplateKey enum
--
-- New combined sale+rental variant of the interested-client flow. Resolved by
-- (contractType = "החתמת מתעניין", dealType = BOTH) -> INTERESTED_BUYER_BOTH.
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

ALTER TYPE "ContractTemplateKey" ADD VALUE IF NOT EXISTS 'INTERESTED_BUYER_BOTH';
