-- Rollback for 20260615120000_grow_merchant_business_metadata.
-- Drops the two additive columns. Safe: they are nullable and only written by the
-- Grow onboarding provisioning path; no other code depends on them.

ALTER TABLE "GrowBrokerMerchant" DROP COLUMN IF EXISTS "businessTitle";
ALTER TABLE "GrowBrokerMerchant" DROP COLUMN IF EXISTS "packageName";
