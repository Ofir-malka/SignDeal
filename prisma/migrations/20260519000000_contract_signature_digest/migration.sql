-- Migration: 20260519000000_contract_signature_digest
--
-- Adds a server-computed signature integrity digest to the Contract table.
--
-- signatureDigest stores a SHA-256 hash over the full signing context:
--   contractId, contractType, dealType, propertyAddress, propertyCity,
--   propertyPrice, commission, commissionSale, generatedText, language,
--   clientName, clientPhone, clientEmail, clientIdNumber,
--   signedAt (server-controlled), signatureIp, userAgent, signatureData.
--
-- Computed server-side at signing time by lib/signature-integrity.ts.
-- Null for contracts signed before this migration (backward-compatible LEGACY status).
-- Never updated after the signing transaction — treated as immutable.
--
-- The existing signatureHash column (client-supplied SHA-256 of signatureData only)
-- is intentionally preserved for backward compatibility.

ALTER TABLE "Contract" ADD COLUMN "signatureDigest" TEXT;
