-- Phase C: Stripe Checkout Session tracking fields on Payment
--
-- stripeCheckoutSessionId: populated when a Stripe Checkout Session is created (cs_...).
--   The webhook handler and /pay/complete look up the Payment by this value.
--
-- stripePaymentIntentId: populated when the checkout.session.completed webhook fires (pi_...).
--   Stored for transfer reconciliation and future refund support.
--
-- The index on stripeCheckoutSessionId supports fast webhook lookup and idempotency checks.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePaymentIntentId"   TEXT;

-- CreateIndex
CREATE INDEX "Payment_stripeCheckoutSessionId_idx" ON "Payment"("stripeCheckoutSessionId");
