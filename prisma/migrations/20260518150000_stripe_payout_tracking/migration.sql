-- Phase D: Stripe Transfer + Payout tracking
--
-- Adds transfer status and payout linkage to the Payment table so brokers can
-- see whether their commission has been transferred and paid out to their bank.
--
-- Creates StripePayoutEvent: one row per Stripe payout (po_...) on a broker's
-- Express account.  Populated by the Connect webhook (payout.*).
--
-- Reconciliation: on payout.paid, balance transactions are enumerated via the
-- Stripe API, and matching Payment rows are linked via stripeTransferId →
-- StripePayoutEvent.payoutId.

-- AlterTable: add transfer/payout tracking fields to Payment
ALTER TABLE "Payment" ADD COLUMN "transferStatus" TEXT;
ALTER TABLE "Payment" ADD COLUMN "payoutId"       TEXT;

-- CreateTable: StripePayoutEvent
CREATE TABLE "StripePayoutEvent" (
    "id"             TEXT         NOT NULL,
    "stripeAccountId" TEXT        NOT NULL,
    "payoutId"       TEXT         NOT NULL,
    "status"         TEXT         NOT NULL,
    "amount"         INTEGER      NOT NULL,
    "currency"       TEXT         NOT NULL DEFAULT 'ils',
    "arrivalDate"    TIMESTAMP(3),
    "failureCode"    TEXT,
    "failureMessage" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePayoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: StripePayoutEvent unique + performance indexes
CREATE UNIQUE INDEX "StripePayoutEvent_payoutId_key"       ON "StripePayoutEvent"("payoutId");
CREATE INDEX        "StripePayoutEvent_stripeAccountId_idx" ON "StripePayoutEvent"("stripeAccountId");
CREATE INDEX        "StripePayoutEvent_status_idx"          ON "StripePayoutEvent"("status");
CREATE INDEX        "StripePayoutEvent_arrivalDate_idx"     ON "StripePayoutEvent"("arrivalDate");

-- CreateIndex: Payment.payoutId for payout → payments reconciliation
CREATE INDEX "Payment_payoutId_idx" ON "Payment"("payoutId");

-- AddForeignKey: Payment.payoutId → StripePayoutEvent.payoutId
-- SET NULL on delete: removing a payout event orphans Payment rows safely.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payoutId_fkey"
    FOREIGN KEY ("payoutId")
    REFERENCES "StripePayoutEvent"("payoutId")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: StripePayoutEvent.stripeAccountId → BrokerStripeAccount.stripeAccountId
-- CASCADE on delete: if a broker account is removed, its payout events go too.
ALTER TABLE "StripePayoutEvent" ADD CONSTRAINT "StripePayoutEvent_stripeAccountId_fkey"
    FOREIGN KEY ("stripeAccountId")
    REFERENCES "BrokerStripeAccount"("stripeAccountId")
    ON DELETE CASCADE ON UPDATE CASCADE;
