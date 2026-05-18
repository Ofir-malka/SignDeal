-- Migration: 20260518130000_stripe_connect_phase_a
--
-- Phase A: Stripe Connect DB foundation for client-to-broker brokerage payments.
--
-- ⚠  This migration has NO effect on HYP billing (SaaS subscription).
--    HYP fields live on Subscription / BillingCheckout / BillingCharge.
--    The new tables and columns below are for the Stripe Connect integration only.
--
-- Safe to apply while the application is running:
--   • New tables → no existing rows affected.
--   • New nullable columns on Payment → existing rows receive NULL; no backfill.
--   • New enums → created before the tables that use them.
--
-- Run order:
--   1. Create enums
--   2. Create BrokerStripeAccount table
--   3. Create WebhookEvent table
--   4. Add nullable columns to Payment

-- ── 1. New enums ───────────────────────────────────────────────────────────────

CREATE TYPE "StripeOnboardingStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETE',
  'RESTRICTED'
);

CREATE TYPE "WebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

-- ── 2. BrokerStripeAccount ─────────────────────────────────────────────────────
--
-- 1-to-1 with User. Created when a broker initiates Stripe Connect onboarding.
-- ON DELETE CASCADE: removing a User also removes their Stripe account record.
-- No row = broker has not started onboarding.

CREATE TABLE "BrokerStripeAccount" (
  "id"               TEXT                     NOT NULL,
  "userId"           TEXT                     NOT NULL,
  "stripeAccountId"  TEXT                     NOT NULL,
  "onboardingStatus" "StripeOnboardingStatus" NOT NULL DEFAULT 'PENDING',
  "chargesEnabled"   BOOLEAN                  NOT NULL DEFAULT false,
  "payoutsEnabled"   BOOLEAN                  NOT NULL DEFAULT false,
  "detailsSubmitted" BOOLEAN                  NOT NULL DEFAULT false,
  "country"          TEXT                     NOT NULL DEFAULT 'IL',
  "currency"         TEXT                     NOT NULL DEFAULT 'ils',
  "createdAt"        TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BrokerStripeAccount_pkey" PRIMARY KEY ("id")
);

-- 1-to-1 uniqueness: one Stripe account per broker
CREATE UNIQUE INDEX "BrokerStripeAccount_userId_key"
  ON "BrokerStripeAccount"("userId");

-- Prevents duplicate acct_ entries if Stripe somehow issues two accounts
CREATE UNIQUE INDEX "BrokerStripeAccount_stripeAccountId_key"
  ON "BrokerStripeAccount"("stripeAccountId");

-- Phase B query support: "find brokers still pending onboarding"
CREATE INDEX "BrokerStripeAccount_onboardingStatus_idx"
  ON "BrokerStripeAccount"("onboardingStatus");

-- FK: cascades on user deletion so orphaned Stripe account records cannot accumulate
ALTER TABLE "BrokerStripeAccount"
  ADD CONSTRAINT "BrokerStripeAccount_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- ── 3. WebhookEvent ────────────────────────────────────────────────────────────
--
-- Append-only idempotency log for inbound payment provider webhooks.
-- (provider, eventId) unique together → duplicate events raise a unique-constraint
-- violation which the handler catches to safely skip reprocessing.
--
-- payload is JSONB for efficient querying; provider and event columns are TEXT
-- because they are provider-specific strings, not enums (avoids enum-migration
-- overhead when adding a new provider).

CREATE TABLE "WebhookEvent" (
  "id"          TEXT                 NOT NULL,
  "provider"    TEXT                 NOT NULL,
  "eventId"     TEXT                 NOT NULL,
  "eventType"   TEXT                 NOT NULL,
  "payload"     JSONB                NOT NULL,
  "processedAt" TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"      "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "error"       TEXT,

  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Composite idempotency key: a given provider event is processed at most once
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key"
  ON "WebhookEvent"("provider", "eventId");

-- Supporting indexes for admin queries and retention jobs
CREATE INDEX "WebhookEvent_provider_idx"     ON "WebhookEvent"("provider");
CREATE INDEX "WebhookEvent_status_idx"       ON "WebhookEvent"("status");
CREATE INDEX "WebhookEvent_processedAt_idx"  ON "WebhookEvent"("processedAt");

-- ── 4. Payment table additions ─────────────────────────────────────────────────
--
-- Both columns are nullable — all existing Rapyd payment rows keep NULL.
-- They are only populated for Stripe payments (Phase D+).
--
-- stripeTransferId     Set when Stripe fires transfer.created confirming broker payout.
-- applicationFeeAmount Actual platform fee collected by Stripe in agorot; may differ
--                      from computed platformFee due to rounding.

ALTER TABLE "Payment"
  ADD COLUMN "stripeTransferId"     TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "applicationFeeAmount" INTEGER;
