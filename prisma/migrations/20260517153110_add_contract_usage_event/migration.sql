-- CreateTable
CREATE TABLE "ContractUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT,
    "plan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractUsageEvent_contractId_key" ON "ContractUsageEvent"("contractId");

-- CreateIndex
CREATE INDEX "ContractUsageEvent_userId_createdAt_idx" ON "ContractUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractUsageEvent_contractId_idx" ON "ContractUsageEvent"("contractId");

-- AddForeignKey
ALTER TABLE "ContractUsageEvent" ADD CONSTRAINT "ContractUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractUsageEvent" ADD CONSTRAINT "ContractUsageEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: seed one ContractUsageEvent per existing Contract.
-- Preserves the original createdAt so historical monthly counts remain accurate.
-- gen_random_uuid() is available in Postgres 13+ (Neon/Vercel Postgres) without extensions.
-- LEFT JOIN Subscription so contracts with no subscription row still get an event
-- (fallback plan = 'STANDARD').
INSERT INTO "ContractUsageEvent" ("id", "userId", "contractId", "plan", "createdAt")
SELECT
    'evt_' || replace(gen_random_uuid()::text, '-', ''),
    c."userId",
    c."id",
    COALESCE(s."plan"::text, 'STANDARD'),
    c."createdAt"
FROM "Contract" c
LEFT JOIN "Subscription" s ON s."userId" = c."userId";
