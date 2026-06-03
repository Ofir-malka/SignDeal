-- ============================================================================
-- ROLLBACK (compensating / down migration) for:
--   20260602120000_grow_phase1_foundation
--
-- Prisma migrations are forward-only; this hand-authored script reverses the
-- forward migration exactly. It is NOT auto-applied — run it manually only if the
-- forward migration must be undone.
--
-- Drop order (reverse of create, to respect dependencies):
--   1. foreign keys
--   2. indexes on EXISTING tables (Payment, Subscription)
--   3. columns added to existing tables (Payment, Subscription, BillingCharge)
--   4. new tables (their own indexes/PKs/partial-unique index drop with them)
--   5. enums last (nothing references them once tables/columns are gone)
--
-- SAFETY: This destroys the EncryptedSecret table and all wrapped secret
-- material. Because secrets are crypto-shredded (not recoverable) once the KEK is
-- rotated/discarded, take a logical backup of "EncryptedSecret" first if any real
-- secrets have been stored. In Phase 1 the table is expected to be empty.
-- ============================================================================

-- DropForeignKey
ALTER TABLE "GrowBrokerMerchant" DROP CONSTRAINT "GrowBrokerMerchant_userId_fkey";

-- DropForeignKey
ALTER TABLE "GrowOnboardingSession" DROP CONSTRAINT "GrowOnboardingSession_userId_fkey";

-- DropIndex (existing tables — see CONCURRENTLY note in prisma/rollback/README)
DROP INDEX "Payment_growTransactionId_idx";

-- DropIndex
DROP INDEX "Subscription_billingProvider_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "cardLast4",
DROP COLUMN "growProcessId",
DROP COLUMN "growTransactionId",
DROP COLUMN "paymentMethod",
DROP COLUMN "routedProvider",
DROP COLUMN "settlementExpectedAt",
DROP COLUMN "settlementStatus";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "growSaasChargeSecretRef",
DROP COLUMN "growSaasCustomerId";

-- AlterTable
ALTER TABLE "BillingCharge" DROP COLUMN "growApprovalCode",
DROP COLUMN "growRaw",
DROP COLUMN "growStatusCode",
DROP COLUMN "growTransId";

-- DropIndex (partial unique — explicit; would also drop with its table below)
DROP INDEX IF EXISTS "EncryptedSecret_active_owner_purpose_key";

-- DropTable
DROP TABLE "EncryptedSecret";

-- DropTable
DROP TABLE "GrowBrokerMerchant";

-- DropTable
DROP TABLE "GrowOnboardingSession";

-- DropEnum
DROP TYPE "SecretBackend";

-- DropEnum
DROP TYPE "SecretPurpose";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "GrowOnboardingStatus";
