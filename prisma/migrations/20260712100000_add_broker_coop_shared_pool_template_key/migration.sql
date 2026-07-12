-- Migration: add BROKER_COOP_SHARED_POOL to the ContractTemplateKey enum
--
-- First production key of the broker-cooperation family ("הסכם שיתוף פעולה
-- בין מתווכים — קופה משותפת"): Broker A is the SignDeal user, Broker B is the
-- external cooperating broker who signs via the standard signing link (modeled
-- through the existing Client relation). Brokerage fees from both sides form
-- one shared pool split equally per the legal text — the document carries no
-- fee amounts, so fee chrome is suppressed for it (hidesFeeChrome, Phase 1B).
-- The legacy generic BROKER_COOP key remains as the base/fallback for old rows.
-- Dormant until Phase 1B wires resolution + seed.
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this;
-- isolated as the only statement per house convention).
--
-- Additive only — no existing rows are affected. The IF NOT EXISTS guard makes
-- this idempotent. Enum values cannot be dropped in PostgreSQL, so rollback is a
-- forward migration; the unused value is harmless.

ALTER TYPE "ContractTemplateKey" ADD VALUE IF NOT EXISTS 'BROKER_COOP_SHARED_POOL';
