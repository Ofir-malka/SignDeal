-- ── 1. Auth fields on User ────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "passwordHash"    TEXT,
  ADD COLUMN "emailVerified"   TIMESTAMP(3),
  ADD COLUMN "image"           TEXT,
  ADD COLUMN "profileComplete" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Client ownership ───────────────────────────────────────────────────────
-- Step a: add nullable
ALTER TABLE "Client" ADD COLUMN "userId" TEXT;

-- Step b: backfill to demo user (safe no-op if demo user doesn't exist yet)
UPDATE "Client"
SET "userId" = (
  SELECT id FROM "User" WHERE email = 'demo@signdeal.app' LIMIT 1
)
WHERE "userId" IS NULL;

-- Step c: enforce NOT NULL
ALTER TABLE "Client" ALTER COLUMN "userId" SET NOT NULL;

-- Step d: foreign key + index
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Client_userId_idx" ON "Client"("userId");

-- ── 3. Auth.js adapter tables ─────────────────────────────────────────────────
CREATE TABLE "Account" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "type"              TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token"     TEXT,
  "access_token"      TEXT,
  "expires_at"        INTEGER,
  "token_type"        TEXT,
  "scope"             TEXT,
  "id_token"          TEXT,
  "session_state"     TEXT,

  CONSTRAINT "Account_pkey"                          PRIMARY KEY ("id"),
  CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId"),
  CONSTRAINT "Account_userId_fkey"                   FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "Session" (
  "id"           TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "expires"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Session_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "Session_sessionToken_key" UNIQUE ("sessionToken"),
  CONSTRAINT "Session_userId_fkey"      FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expires"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VerificationToken_token_key"            UNIQUE ("token"),
  CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
);
