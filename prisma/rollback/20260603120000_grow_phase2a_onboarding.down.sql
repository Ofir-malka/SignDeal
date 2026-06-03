-- ============================================================================
-- ROLLBACK (compensating / down migration) for:
--   20260603120000_grow_phase2a_onboarding
--
-- Prisma migrations are forward-only; this hand-authored script reverses the
-- forward migration exactly. It is NOT auto-applied — run it manually only if the
-- forward migration must be undone. (Same convention as the Phase 1 down script.)
--
-- Drop order (reverse of create, to respect dependencies):
--   1. foreign key
--   2. new table (its indexes + PK drop with it)
--   3. columns added to GrowOnboardingSession
--   4. enum value (SPECIAL — see note; left COMMENTED by default)
--
-- SAFETY: GrowOnboardingCallbackEvent holds only SANITIZED payloads (no plaintext
-- secrets — api_key is sealed in EncryptedSecret) plus correlation metadata.
-- Dropping it destroys the inbound-callback audit trail; export it first if needed.
-- In Phase 2A the table is expected to be empty (no runtime writes yet).
-- ============================================================================

-- DropForeignKey
ALTER TABLE "GrowOnboardingCallbackEvent" DROP CONSTRAINT "GrowOnboardingCallbackEvent_sessionId_fkey";

-- DropTable (its indexes + PK drop with it)
DROP TABLE "GrowOnboardingCallbackEvent";

-- AlterTable (drop the 4 columns added to GrowOnboardingSession)
ALTER TABLE "GrowOnboardingSession" DROP COLUMN "phone",
DROP COLUMN "expectedTrackingCode",
DROP COLUMN "statusReason",
DROP COLUMN "attemptCount";

-- ----------------------------------------------------------------------------
-- ENUM VALUE REMOVAL — GrowOnboardingStatus -= 'PENDING_VERIFICATION'
--
-- PostgreSQL CANNOT drop a single enum value. Leaving the unused value in place is
-- HARMLESS (it is inert until written to a row). Full removal requires a type-swap
-- and is SAFE ONLY IF no row currently uses the value. In Phase 2A the value is
-- never written (schema-only, no runtime), so the guard below returns 0.
--
-- This block is COMMENTED OUT by default. Uncomment and run MANUALLY only if a
-- clean type definition is required AND the guard returns 0.
-- ----------------------------------------------------------------------------
-- -- Guard (must return 0 before proceeding):
-- --   SELECT count(*) FROM "GrowOnboardingSession" WHERE "status" = 'PENDING_VERIFICATION';
--
-- ALTER TYPE "GrowOnboardingStatus" RENAME TO "GrowOnboardingStatus_old";
-- CREATE TYPE "GrowOnboardingStatus" AS ENUM ('PENDING', 'LINK_ISSUED', 'COMPLETED', 'EXPIRED', 'FAILED');
-- ALTER TABLE "GrowOnboardingSession"
--   ALTER COLUMN "status" DROP DEFAULT,
--   ALTER COLUMN "status" TYPE "GrowOnboardingStatus" USING ("status"::text::"GrowOnboardingStatus"),
--   ALTER COLUMN "status" SET DEFAULT 'PENDING';
-- DROP TYPE "GrowOnboardingStatus_old";
--
-- After any manual rollback, also reconcile Prisma's _prisma_migrations table
-- (delete the row for 20260603120000_grow_phase2a_onboarding) so
-- `prisma migrate status` stays consistent.
