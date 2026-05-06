-- CreateEnum
CREATE TYPE "PropertyListingType" AS ENUM ('RENTAL', 'SALE', 'BOTH');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "listingType" "PropertyListingType" NOT NULL DEFAULT 'RENTAL';
