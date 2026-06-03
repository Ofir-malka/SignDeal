-- ============================================================================
-- Migration: 20260602120000_grow_phase1_foundation
-- Phase 1 (DB + security foundation) for the Grow migration.
--
-- This migration is ADDITIVE ONLY:
--   * 4 new enums
--   * nullable columns added to Payment / Subscription / BillingCharge
--   * 3 new tables (EncryptedSecret, GrowBrokerMerchant, GrowOnboardingSession)
--   * indexes (all on empty new tables, except 2 on existing tables — see note)
--   * 2 foreign keys (both ON DELETE RESTRICT)
--
-- No data is modified, no column is dropped, no column is made NOT NULL.
-- No runtime code reads any of this yet (Phase 1 contract).
--
-- ⚠ EXISTING-TABLE INDEXES (production note):
--   "Payment_growTransactionId_idx" and "Subscription_billingProvider_idx"
--   are created here with a plain (transactional) CREATE INDEX. That is safe on
--   dev / shadow and on small tables. On a large PRODUCTION table this acquires a
--   SHARE lock for the duration of the build. If Payment/Subscription are large in
--   production, create those two indexes OUT OF BAND with CREATE INDEX CONCURRENTLY
--   (which cannot run inside Prisma's migration transaction) BEFORE deploying this
--   migration, then this migration's CREATE INDEX becomes a fast no-op via the
--   IF NOT EXISTS path documented in prisma/rollback/.
-- ============================================================================

-- CreateEnum
CREATE TYPE "SecretBackend" AS ENUM ('DB_ENVELOPE', 'KMS', 'VAULT');

-- CreateEnum
CREATE TYPE "SecretPurpose" AS ENUM ('GROW_BROKER_API_KEY', 'GROW_SAAS_CHARGE_TOKEN', 'GROW_ONBOARDING_LEAD', 'PAYER_BANK_ACCOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('APPLE_PAY', 'GOOGLE_PAY', 'BIT', 'CREDIT_CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "GrowOnboardingStatus" AS ENUM ('PENDING', 'LINK_ISSUED', 'COMPLETED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "growProcessId" TEXT,
ADD COLUMN     "growTransactionId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "routedProvider" TEXT,
ADD COLUMN     "settlementExpectedAt" TIMESTAMP(3),
ADD COLUMN     "settlementStatus" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "growSaasChargeSecretRef" TEXT,
ADD COLUMN     "growSaasCustomerId" TEXT;

-- AlterTable
ALTER TABLE "BillingCharge" ADD COLUMN     "growApprovalCode" TEXT,
ADD COLUMN     "growRaw" TEXT,
ADD COLUMN     "growStatusCode" TEXT,
ADD COLUMN     "growTransId" TEXT;

-- CreateTable
CREATE TABLE "EncryptedSecret" (
    "id" TEXT NOT NULL,
    "purpose" "SecretPurpose" NOT NULL,
    "rail" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ciphertext" BYTEA,
    "externalRef" TEXT,
    "encVersion" INTEGER NOT NULL,
    "kekVersion" INTEGER NOT NULL,
    "backend" "SecretBackend" NOT NULL DEFAULT 'DB_ENVELOPE',
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowBrokerMerchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "growUserId" TEXT,
    "trackingCode" TEXT,
    "packageId" TEXT,
    "trackingStatus" TEXT,
    "apiKeySecretRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowBrokerMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowOnboardingSession" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GrowOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "businessNumber" TEXT,
    "growUserId" TEXT,
    "leadSecretRef" TEXT,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowOnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncryptedSecret_ownerType_ownerId_idx" ON "EncryptedSecret"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "EncryptedSecret_purpose_idx" ON "EncryptedSecret"("purpose");

-- CreateIndex
CREATE INDEX "EncryptedSecret_expiresAt_idx" ON "EncryptedSecret"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowBrokerMerchant_userId_key" ON "GrowBrokerMerchant"("userId");

-- CreateIndex
CREATE INDEX "GrowBrokerMerchant_growUserId_idx" ON "GrowBrokerMerchant"("growUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowOnboardingSession_reference_key" ON "GrowOnboardingSession"("reference");

-- CreateIndex
CREATE INDEX "GrowOnboardingSession_userId_idx" ON "GrowOnboardingSession"("userId");

-- CreateIndex
CREATE INDEX "GrowOnboardingSession_status_idx" ON "GrowOnboardingSession"("status");

-- CreateIndex
CREATE INDEX "Payment_growTransactionId_idx" ON "Payment"("growTransactionId");

-- CreateIndex
CREATE INDEX "Subscription_billingProvider_idx" ON "Subscription"("billingProvider");

-- AddForeignKey
ALTER TABLE "GrowBrokerMerchant" ADD CONSTRAINT "GrowBrokerMerchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowOnboardingSession" ADD CONSTRAINT "GrowOnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- RAW SQL (hand-authored — not expressible in the Prisma schema DSL)
--
-- Single-active-secret invariant: at most ONE non-purged EncryptedSecret per
-- (ownerType, ownerId, purpose). Purged rows are excluded so that crypto-shred +
-- re-provision (a NEW row) does not collide with the tombstoned old row.
-- Prisma's @@unique cannot express a partial (WHERE) predicate, so it is created
-- here directly. This runs on the freshly-created (empty) table, so no
-- CONCURRENTLY is needed.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX "EncryptedSecret_active_owner_purpose_key"
    ON "EncryptedSecret" ("ownerType", "ownerId", "purpose")
    WHERE "purgedAt" IS NULL;
