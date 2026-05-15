-- Migration: phase2a_card_first_trial
--
-- Adds the INCOMPLETE subscription status and all card-on-file / recurring-billing
-- placeholder fields to the Subscription table.
--
-- Safety notes:
--   • ALTER TYPE ... ADD VALUE cannot run inside a transaction block in PostgreSQL.
--     Prisma's migration runner executes it in its own implicit transaction — safe.
--   • All new columns are nullable (or have a DEFAULT) so existing rows require
--     no backfill. Existing TRIALING/ACTIVE rows are completely unaffected.
--   • The default for Subscription.status remains 'TRIALING' at the DB level
--     (unchanged) — the application layer writes 'INCOMPLETE' for new accounts.
--     Changing the DB default is not needed and avoids touching existing rows.

-- ── Step 1: add INCOMPLETE to the SubscriptionStatus enum ────────────────────
-- Must precede any INSERT or column DEFAULT that references the new value.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'INCOMPLETE';

-- ── Step 2: add card-on-file fields ──────────────────────────────────────────
-- Populated during the INCOMPLETE → TRIALING transition (Phase 2B).
-- Phase 3 recurring billing engine reads cardToken + nextBillingAt.
ALTER TABLE "Subscription"
  ADD COLUMN "cardToken"    TEXT,
  ADD COLUMN "cardBrand"    TEXT,
  ADD COLUMN "cardLast4"    TEXT,
  ADD COLUMN "cardExpMonth" INTEGER,
  ADD COLUMN "cardExpYear"  INTEGER;

-- ── Step 3: add card lifecycle timestamp ─────────────────────────────────────
ALTER TABLE "Subscription"
  ADD COLUMN "tokenCreatedAt" TIMESTAMP(3);

-- ── Step 4: add recurring-billing state fields ────────────────────────────────
-- nextBillingAt is indexed separately (see Step 5) — billing cron cursor.
ALTER TABLE "Subscription"
  ADD COLUMN "firstPaymentAt"  TIMESTAMP(3),
  ADD COLUMN "nextBillingAt"   TIMESTAMP(3),
  ADD COLUMN "billingFailures" INTEGER NOT NULL DEFAULT 0;

-- ── Step 5: index nextBillingAt for Phase 3 billing cron ─────────────────────
-- "SELECT * FROM Subscription WHERE nextBillingAt <= now() AND status IN (...)"
CREATE INDEX "Subscription_nextBillingAt_idx" ON "Subscription"("nextBillingAt");
