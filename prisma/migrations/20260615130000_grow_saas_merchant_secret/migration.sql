-- Add the Rail A platform-merchant secret purpose (SignDeal's OWN Grow SaaS
-- merchant API key). Enum value ONLY: Postgres forbids using a freshly added
-- enum value inside the same transaction, so no row uses it here. The secret row
-- (ownerType="Platform", ownerId="grow_saas") is written later by the Rail A
-- billing secret facade — never by this migration.

ALTER TYPE "SecretPurpose" ADD VALUE 'GROW_SAAS_MERCHANT_API_KEY';
