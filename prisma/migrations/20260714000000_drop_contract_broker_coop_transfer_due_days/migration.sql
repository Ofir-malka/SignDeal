-- Migration: drop Contract.brokerCoopTransferDueDays (Phase 4B.1 correction)
--
-- Product/legal decision: the buyer-to-seller transfer obligation is no longer
-- defined as occurring within a configurable number of days after actual fee
-- collection — clause 5 of the BROKER_COOP_BUYER_TO_SELLER template now makes
-- the transfer due upon signing the binding agreement ("במעמד החתימה"). The
-- day-count concept is removed end-to-end (payload, validation, persistence,
-- buildContext, sign-time regeneration, template placeholder), so the column
-- has no remaining reader or writer.
--
-- Forward-only correction: the applied migration that added the column
-- (20260713100100_add_contract_broker_coop_transfer_fields) is intentionally
-- left untouched as the historical record. brokerCoopTransferPercent stays.
--
-- Data-destructive BY DESIGN for this column: any stored values exist only on
-- contracts-dev rows created during Phase 4B manual testing — production never
-- had the column. DROP COLUMN on a nullable column is transactional-safe and
-- instant (no table rewrite). IF EXISTS makes this idempotent.

ALTER TABLE "Contract" DROP COLUMN IF EXISTS "brokerCoopTransferDueDays";
