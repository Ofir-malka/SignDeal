-- Migration: counterparty broker license (Contract.counterpartyBrokerLicenseNumber)
--
-- Broker-cooperation documents (BROKER_COOP_SHARED_POOL): the cooperating
-- broker's license number, optional. A document-level snapshot — it lives on
-- Contract rather than Client so the generic signer model stays clean, and it
-- remains valid unchanged when the counterparty later becomes a real SignDeal
-- user. Persisted (not just embedded in generatedText) so sign-time
-- regeneration can rebuild the party line deterministically; rendered via the
-- {{counterpartyBrokerLicenseSuffix}} context key (empty when absent — the
-- document never shows a dangling "רישיון תיווך מס׳ —").
--
-- Nullable — PostgreSQL adds a nullable column instantly, no table rewrite.
-- Backward-compatible: every existing row stays NULL. IF NOT EXISTS makes this
-- a safe no-op on databases where the column already exists.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "counterpartyBrokerLicenseNumber" TEXT;
