-- CreateEnum
CREATE TYPE "BillingChargeStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "BillingCharge" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BillingChargeStatus" NOT NULL DEFAULT 'PENDING',
    "amountAgorot" INTEGER NOT NULL,
    "plan" "PlanType" NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "hypTransId" TEXT,
    "hypCCode" TEXT,
    "hypRaw" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingCharge_subscriptionId_idx" ON "BillingCharge"("subscriptionId");

-- CreateIndex
CREATE INDEX "BillingCharge_userId_idx" ON "BillingCharge"("userId");

-- CreateIndex
CREATE INDEX "BillingCharge_status_idx" ON "BillingCharge"("status");

-- CreateIndex
CREATE INDEX "BillingCharge_createdAt_idx" ON "BillingCharge"("createdAt");

-- AddForeignKey
ALTER TABLE "BillingCharge" ADD CONSTRAINT "BillingCharge_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
