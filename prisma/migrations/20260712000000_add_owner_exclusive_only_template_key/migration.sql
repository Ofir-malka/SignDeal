-- Migration: add OWNER_EXCLUSIVE_ONLY to the ContractTemplateKey enum
--
-- Standalone owner exclusivity agreement — for owners who grant marketing
-- exclusivity WITHOUT committing to owner-side brokerage fees (the broker may
-- collect only from the other side of the deal). Derived from
-- OWNER_EXCLUSIVE_GENERAL with the service-order references and the owner
-- fee-obligation clauses (old 12-14) removed. Never linked (no
-- relatedContractId) and never dealType-resolved; created explicitly by the
-- owner flow's "exclusivityOnly" mode (Phase 5B). Dormant until then.
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this;
-- isolated as the only statement per house convention).
--
-- Additive only — no existing rows are affected. The IF NOT EXISTS guard makes
-- this idempotent. Enum values cannot be dropped in PostgreSQL, so rollback is a
-- forward migration; the unused value is harmless.

ALTER TYPE "ContractTemplateKey" ADD VALUE IF NOT EXISTS 'OWNER_EXCLUSIVE_ONLY';
