-- Migration: persist how the sale brokerage fee was chosen
-- (Contract.saleCommissionMode + Contract.saleCommissionPercent)
--
-- Drives the dynamic wording of clause 5.1 in the INTERESTED_BUYER_SALE template
-- and lets the signing-route regeneration reproduce the same clause
-- deterministically (the broker's chosen percentage must survive regeneration).
--
-- CREATE TYPE for a NEW enum and referencing it in ADD COLUMN within the same
-- transaction is permitted in PostgreSQL — the "cannot run inside a transaction"
-- restriction only applies to ALTER TYPE ... ADD VALUE on an existing enum,
-- which is not the case here.
--
-- Nullable: existing rows and all non-sale-template contracts remain valid with
-- NULL. saleCommissionPercent stores the human percentage (2, 1.5) and is set
-- only when saleCommissionMode = 'PERCENT'.

CREATE TYPE "SaleCommissionMode" AS ENUM ('PERCENT', 'FIXED');

ALTER TABLE "Contract" ADD COLUMN "saleCommissionMode" "SaleCommissionMode";

ALTER TABLE "Contract" ADD COLUMN "saleCommissionPercent" DOUBLE PRECISION;
