-- CreateEnum
CREATE TYPE "BillingCheckoutStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BillingCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "status" "BillingCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "txId" TEXT,
    "hkId" TEXT,
    "cardToken" TEXT,
    "cardExp" TEXT,
    "cardMask" TEXT,
    "authNumber" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckout_order_key" ON "BillingCheckout"("order");

-- CreateIndex
CREATE INDEX "BillingCheckout_userId_idx" ON "BillingCheckout"("userId");

-- CreateIndex
CREATE INDEX "BillingCheckout_status_idx" ON "BillingCheckout"("status");

-- CreateIndex
CREATE INDEX "BillingCheckout_expiresAt_idx" ON "BillingCheckout"("expiresAt");

-- AddForeignKey
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
