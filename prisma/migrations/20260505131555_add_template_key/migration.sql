-- CreateEnum
CREATE TYPE "ContractTemplateKey" AS ENUM ('INTERESTED_BUYER', 'OWNER_EXCLUSIVE', 'BROKER_COOP');

-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN     "templateKey" "ContractTemplateKey";
