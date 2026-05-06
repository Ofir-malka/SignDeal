-- FeePaidBy enum
CREATE TYPE "FeePaidBy" AS ENUM ('BROKER', 'CLIENT', 'SPLIT');

-- Fee tracking columns on Payment (all nullable — no existing rows affected)
ALTER TABLE "Payment"
  ADD COLUMN "grossAmount"  INTEGER,
  ADD COLUMN "processorFee" INTEGER,
  ADD COLUMN "platformFee"  INTEGER,
  ADD COLUMN "netAmount"    INTEGER,
  ADD COLUMN "feePaidBy"    "FeePaidBy";
