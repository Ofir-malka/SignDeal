-- AlterEnum
-- Add BOTH to DealType. PostgreSQL supports ADD VALUE without a transaction
-- block; existing RENTAL/SALE rows are completely unaffected.

ALTER TYPE "DealType" ADD VALUE 'BOTH';

-- AlterTable
-- Add commissionSale as a nullable INTEGER column.
-- Existing contracts (SALE / RENTAL) keep commissionSale = NULL — correct by design.
-- Only BOTH contracts will have this column populated.

ALTER TABLE "Contract" ADD COLUMN "commissionSale" INTEGER;
