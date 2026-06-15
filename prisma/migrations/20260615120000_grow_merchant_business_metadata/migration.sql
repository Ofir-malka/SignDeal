-- Grow merchant business metadata (Rail B) — additive, nullable, backward-compatible.
-- Persists the broker business title + package name from the Grow onboarding
-- callback (data.business_title / data.package_name) onto GrowBrokerMerchant.
-- No data rewrite; existing rows get NULL. Safe to apply online.

ALTER TABLE "GrowBrokerMerchant" ADD COLUMN "businessTitle" TEXT;
ALTER TABLE "GrowBrokerMerchant" ADD COLUMN "packageName" TEXT;
