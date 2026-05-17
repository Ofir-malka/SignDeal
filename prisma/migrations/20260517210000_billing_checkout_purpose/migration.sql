-- Add checkout purpose field to BillingCheckout (Phase 4B).
--
-- Purpose disambiguates the activation path in /billing/success so the
-- activateCheckout function does not need to infer intent from subscription
-- state, which is ambiguous when a healthy ACTIVE/TRIALING subscriber
-- initiates a payment-method update (looks identical to a normal upgrade).
--
-- Valid values:
--   "checkout"              — normal new subscription / upgrade (backward-compat default)
--   "recovery"              — PAST_DUE or billing-warning user re-entering card
--   "payment_method_update" — healthy subscriber updating card only; no billing-state changes
--
-- DEFAULT 'checkout' means all existing PENDING/SUCCEEDED rows get "checkout",
-- which correctly matches the existing inference logic (no data migration needed).

ALTER TABLE "BillingCheckout" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'checkout';
