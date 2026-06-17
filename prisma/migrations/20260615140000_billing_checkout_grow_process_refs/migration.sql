-- BillingCheckout: Grow (Rail A) token-setup process correlation handles. Additive,
-- nullable — used by getPaymentProcessInfo verify on the /billing/grow/success bridge.
ALTER TABLE "BillingCheckout" ADD COLUMN "growProcessId" TEXT;
ALTER TABLE "BillingCheckout" ADD COLUMN "growProcessToken" TEXT;
