-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "signatureData" TEXT,
ADD COLUMN     "signatureHash" TEXT,
ADD COLUMN     "userAgent" TEXT;
