-- Migration: buyer-to-seller transfer terms (Contract.brokerCoopTransferPercent
-- + Contract.brokerCoopTransferDueDays)
--
-- Broker-cooperation buyer-to-seller documents (BROKER_COOP_BUYER_TO_SELLER):
-- the two agreed dynamic values of the legal text, persisted on the Contract as
-- a document-level snapshot so sign-time regeneration can rebuild both clauses
-- deterministically (never derived from the frozen generatedText):
--   • brokerCoopTransferPercent — human percent of the deal price (0.5, 1,
--     1.5, 2 …) the buyer/tenant-side broker transfers to the seller/landlord-
--     side broker, plus VAT. DOUBLE PRECISION matches the established percent
--     convention (Contract.saleCommissionPercent / Prisma Float).
--   • brokerCoopTransferDueDays — agreed number of days from actual collection
--     of the brokerage fee to the transfer (clause 5). INTEGER.
--
-- Nullable — PostgreSQL adds nullable columns instantly, no table rewrite.
-- Backward-compatible: every existing row stays NULL (the fields are set only
-- for the buyer-to-seller key, wired in Phase 4B). IF NOT EXISTS makes this a
-- safe no-op on databases where the columns already exist.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "brokerCoopTransferPercent" DOUBLE PRECISION;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "brokerCoopTransferDueDays" INTEGER;
