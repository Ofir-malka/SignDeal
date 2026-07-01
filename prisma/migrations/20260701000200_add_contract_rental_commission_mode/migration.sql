-- Migration: persist how the rental brokerage fee was chosen (Contract.rentalCommissionMode)
--
-- Drives the dynamic wording of clause 6.1 in the INTERESTED_BUYER_RENTAL template
-- and lets the signing-route regeneration reproduce the same clause deterministically.
--
-- CREATE TYPE for a NEW enum and referencing it in ADD COLUMN within the same
-- transaction is permitted in PostgreSQL — the "cannot run inside a transaction"
-- restriction only applies to ALTER TYPE ... ADD VALUE on an existing enum, which
-- is not the case here.
--
-- Nullable: existing rows and all SALE/BOTH contracts remain valid with NULL.

CREATE TYPE "RentalCommissionMode" AS ENUM ('ONE_MONTH', 'FIXED');

ALTER TABLE "Contract" ADD COLUMN "rentalCommissionMode" "RentalCommissionMode";
