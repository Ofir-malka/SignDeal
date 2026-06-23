-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "billingCustomerId",
DROP COLUMN "billingSubscriptionId",
DROP COLUMN "cardToken";

-- AlterTable
ALTER TABLE "BillingCheckout" DROP COLUMN "authNumber",
DROP COLUMN "cardExp",
DROP COLUMN "cardToken",
DROP COLUMN "errorCode",
DROP COLUMN "hkId",
DROP COLUMN "txId";

-- AlterTable
ALTER TABLE "BillingCharge" DROP COLUMN "hypRaw",
DROP COLUMN "hypTransId";
