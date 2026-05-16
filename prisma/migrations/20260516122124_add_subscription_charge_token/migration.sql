-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "chargeToken" TEXT,
ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';
