-- Phase E — Operational Safety: DB Indexes and Unique Constraint
--
-- Changes in this migration:
--   1. UNIQUE constraint on BillingCharge(subscriptionId, periodStart)
--      Prevents duplicate charge rows for the same subscription billing period.
--      The application-level idempotency check (findFirst) is soft; this is the
--      hard DB-level guard that closes the concurrent cron invocation race window.
--
--   2. Compound index on Subscription(status, nextBillingAt)
--      Optimises the billing cron WHERE clause which filters on both columns.
--      The existing single-column indexes remain; this compound index eliminates
--      the planner from having to choose one and scan-filter the other.
--
--   3. Index on Message(status)
--      Optimises admin/watchdog queries for PENDING and FAILED messages.
--      The Message model had zero indexes prior to this migration.
--
--   4. Index on Message(createdAt)
--      Optimises time-based watchdog queries (e.g. "PENDING older than 1 hour").
--
-- Production safety notes:
--   • The duplicate-check assertion (DO $$ ... $$) runs first. If existing data
--     contains duplicate (subscriptionId, periodStart) pairs the assertion raises
--     an exception and the migration is aborted — no partial state.
--   • All CREATE INDEX statements acquire a ShareLock on the target table.
--     On a table with millions of rows consider running them as CONCURRENT
--     (outside a transaction) before deploying. For current scale this is safe.
--   • ALTER TABLE ADD CONSTRAINT acquires an AccessExclusiveLock momentarily.
--     On small tables (current scale) this is negligible.

-- ── 1. Safety assertion — no duplicate (subscriptionId, periodStart) rows ──────
DO $$
BEGIN
  IF EXISTS (
    SELECT "subscriptionId", "periodStart"
    FROM   "BillingCharge"
    GROUP  BY "subscriptionId", "periodStart"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: duplicate BillingCharge rows exist for the same '
      '(subscriptionId, periodStart). Resolve duplicates manually before '
      'running this migration.';
  END IF;
END $$;

-- ── 2. Unique constraint on BillingCharge(subscriptionId, periodStart) ─────────
ALTER TABLE "BillingCharge"
  ADD CONSTRAINT "BillingCharge_subscriptionId_periodStart_key"
  UNIQUE ("subscriptionId", "periodStart");

-- ── 3. Compound index on Subscription(status, nextBillingAt) ───────────────────
CREATE INDEX IF NOT EXISTS "Subscription_status_nextBillingAt_idx"
  ON "Subscription"(status, "nextBillingAt");

-- ── 4. Index on Message(status) ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Message_status_idx"
  ON "Message"(status);

-- ── 5. Index on Message(createdAt) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx"
  ON "Message"("createdAt");
