-- CreateEnum: ContractTemplateLanguage
CREATE TYPE "ContractTemplateLanguage" AS ENUM ('HE', 'EN', 'FR', 'RU', 'AR');

-- ContractTemplate.language (default HE — backfills all existing rows)
ALTER TABLE "ContractTemplate"
  ADD COLUMN "language" "ContractTemplateLanguage" NOT NULL DEFAULT 'HE';

-- Contract.language (stored as plain text for simplicity; default HE)
ALTER TABLE "Contract"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'HE';
