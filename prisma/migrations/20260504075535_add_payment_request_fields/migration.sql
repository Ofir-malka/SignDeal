-- AlterEnum: drop OVERDUE, add FAILED and CANCELED
-- Must drop the column default before altering the type, then restore it

-- Step 1: remove default on status column
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;

-- Step 2: recreate enum without OVERDUE, with FAILED and CANCELED
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED');
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "PaymentStatus_old";
COMMIT;

-- Step 3: restore default
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: rename reference → providerPaymentId
ALTER TABLE "Payment" RENAME COLUMN "reference" TO "providerPaymentId";

-- AlterTable: add new columns, drop method
ALTER TABLE "Payment"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "paymentUrl" TEXT,
  DROP COLUMN "method";
