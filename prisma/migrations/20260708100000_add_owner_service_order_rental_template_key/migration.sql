-- Migration: add OWNER_SERVICE_ORDER_RENTAL to the ContractTemplateKey enum
--
-- Owner two-document family: the service-order agreement carries the fee terms
-- and is the primary document, resolved by (owner contractType + dealType RENTAL).
-- The general exclusivity agreement (OWNER_EXCLUSIVE_GENERAL) is a separate,
-- optional secondary document.
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this;
-- isolated as the only statement per house convention).
--
-- Additive only — no existing rows are affected. The IF NOT EXISTS guard makes
-- this idempotent. Enum values cannot be dropped in PostgreSQL, so rollback is a
-- forward migration; the unused value is harmless.

ALTER TYPE "ContractTemplateKey" ADD VALUE IF NOT EXISTS 'OWNER_SERVICE_ORDER_RENTAL';
