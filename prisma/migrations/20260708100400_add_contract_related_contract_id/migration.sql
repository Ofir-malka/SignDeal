-- Migration: owner two-document package link (Contract.relatedContractId)
--
-- The general exclusivity agreement (OWNER_EXCLUSIVE_GENERAL) legally references
-- its owner service-order agreement by number/date, so the SECONDARY
-- (exclusivity) contract stores its PRIMARY (service-order) sibling's id.
-- Nullable — every standalone contract stays NULL; no backfill required.
-- Also the anchor for the one-usage-unit-per-package rule: no usage event is
-- written for a secondary document (route logic, later phase).
--
-- Nullable column add = instant, no table rewrite. ON DELETE SET NULL matches
-- the ContractUsageEvent precedent for contract hard-deletes (the frozen
-- generatedText keeps the cited number even if the link nulls out).
-- The FK/index names follow the Prisma convention so future `prisma migrate
-- diff` runs stay clean. ADD CONSTRAINT has no IF NOT EXISTS guard in
-- PostgreSQL — acceptable: no database has this constraint yet.

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "relatedContractId" TEXT;

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_relatedContractId_fkey"
  FOREIGN KEY ("relatedContractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Contract_relatedContractId_idx" ON "Contract"("relatedContractId");
