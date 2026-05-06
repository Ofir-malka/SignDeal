-- 1. Rename name → fullName (preserves all existing data)
ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";

-- 2. Add new nullable columns (existing rows get NULL — no data loss)
ALTER TABLE "User"
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "idNumber"      TEXT,
  ADD COLUMN "logoUrl"       TEXT;

-- 3. Partial unique index: NULLs don't conflict with each other
CREATE UNIQUE INDEX "User_licenseNumber_key"
  ON "User"("licenseNumber")
  WHERE "licenseNumber" IS NOT NULL;
