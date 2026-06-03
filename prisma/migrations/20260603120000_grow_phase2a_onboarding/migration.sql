-- ============================================================================
-- Migration: 20260603120000_grow_phase2a_onboarding
-- Phase 2A (DB schema) for Grow BROKER ONBOARDING — inbound callback ingestion.
--
-- Confirmed Grow onboarding contract reflected by this schema:
--   * callback format = application/json
--   * callback URL = fixed / manually configured on Grow's side (NOT in GetLink)
--   * NO onboarding status API — the callback (and/or email) is the only signal
--   * ingestion -> PENDING_VERIFICATION (merchant stays isActive=false), never ACTIVE
--
-- ADDITIVE ONLY:
--   * 1 new enum value : GrowOnboardingStatus += 'PENDING_VERIFICATION'
--   * 4 columns added to GrowOnboardingSession (all nullable or DEFAULTed)
--   * 1 new table      : GrowOnboardingCallbackEvent (+ 3 indexes, 1 FK)
--
-- No data is modified, no column is dropped, no existing column is made NOT NULL.
-- No runtime code reads any of this yet (Phase 2A contract — schema only).
-- No SecretPurpose change: GROW_ONBOARDING_LEAD / GROW_BROKER_API_KEY already exist.
--
-- ENUM VALUE ADD (PostgreSQL):
--   ALTER TYPE ... ADD VALUE cannot run inside a transaction block; Prisma's
--   migration runner executes it in its own implicit transaction (same pattern as
--   migrations 20260515000000 / 20260524000000). IF NOT EXISTS makes it idempotent.
--   The new value is NOT used elsewhere in this migration (no column default / no
--   data write references it), so there is no same-transaction-use hazard.
--   Enum values CANNOT be removed once added — reversal needs a type-swap; see the
--   paired prisma/rollback/20260603120000_grow_phase2a_onboarding.down.sql.
--
-- INDEXES: all are on the freshly-created, EMPTY GrowOnboardingCallbackEvent table,
--   so a transactional CREATE INDEX is safe (no CONCURRENTLY / out-of-band step).
--   The 4 ADD COLUMNs target GrowOnboardingSession (created empty in Phase 1).
-- ============================================================================

-- AlterEnum
ALTER TYPE "GrowOnboardingStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';

-- AlterTable
ALTER TABLE "GrowOnboardingSession" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "expectedTrackingCode" TEXT,
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GrowOnboardingCallbackEvent" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT,
    "sourceIp" TEXT,
    "httpMethod" TEXT NOT NULL,
    "contentType" TEXT,
    "contentTypeValid" BOOLEAN NOT NULL DEFAULT false,
    "sanitizedPayload" TEXT NOT NULL,
    "parsedOk" BOOLEAN NOT NULL DEFAULT false,
    "dedupKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'stored',

    CONSTRAINT "GrowOnboardingCallbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrowOnboardingCallbackEvent_dedupKey_key" ON "GrowOnboardingCallbackEvent"("dedupKey");

-- CreateIndex
CREATE INDEX "GrowOnboardingCallbackEvent_sessionId_idx" ON "GrowOnboardingCallbackEvent"("sessionId");

-- CreateIndex
CREATE INDEX "GrowOnboardingCallbackEvent_receivedAt_idx" ON "GrowOnboardingCallbackEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "GrowOnboardingCallbackEvent" ADD CONSTRAINT "GrowOnboardingCallbackEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GrowOnboardingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
