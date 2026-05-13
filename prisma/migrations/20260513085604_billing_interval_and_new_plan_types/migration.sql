-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlanType" ADD VALUE 'STANDARD';
ALTER TYPE "PlanType" ADD VALUE 'GROWTH';
ALTER TYPE "PlanType" ADD VALUE 'AGENCY';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
ALTER COLUMN "plan" SET DEFAULT 'STANDARD';

-- ── Data migration: retire deprecated PlanType values ─────────────────────────
-- STARTER → STANDARD (closest equivalent: entry paid tier).
-- ENTERPRISE → AGENCY.
-- PRO rows are unchanged (PRO is reused for the 100-doc/month tier).
--
-- IMPORTANT: Run the verification SELECTs below after applying this migration.
-- Both must return 0 rows. If either returns > 0, roll back and investigate.
--
--   SELECT COUNT(*) AS starter_rows    FROM "Subscription" WHERE plan = 'STARTER';
--   SELECT COUNT(*) AS enterprise_rows FROM "Subscription" WHERE plan = 'ENTERPRISE';

UPDATE "Subscription" SET plan = 'STANDARD' WHERE plan = 'STARTER';
UPDATE "Subscription" SET plan = 'AGENCY'   WHERE plan = 'ENTERPRISE';
