-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM (
  'CONTRACT_SIGNING_LINK',
  'PAYMENT_REQUEST_LINK',
  'SIGNING_REMINDER',
  'PAYMENT_REMINDER',
  'BROKER_CONTRACT_SIGNED',
  'BROKER_PAYMENT_RECEIVED'
);

-- CreateTable: MessageTemplate
CREATE TABLE "MessageTemplate" (
  "id"        TEXT NOT NULL,
  "type"      "MessageType"    NOT NULL,
  "channel"   "MessageChannel" NOT NULL,
  "nameHe"    TEXT NOT NULL,
  "subject"   TEXT,
  "body"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one template per type+channel
CREATE UNIQUE INDEX "MessageTemplate_type_channel_key" ON "MessageTemplate"("type", "channel");

-- CreateTable: Message
CREATE TABLE "Message" (
  "id"                TEXT NOT NULL,

  -- Sender
  "userId"            TEXT,

  -- Recipient (denormalized)
  "clientId"          TEXT,
  "recipientPhone"    TEXT,
  "recipientEmail"    TEXT,

  -- Context
  "contractId"        TEXT,
  "paymentId"         TEXT,

  -- Content
  "type"              "MessageType"    NOT NULL,
  "channel"           "MessageChannel" NOT NULL,
  "templateId"        TEXT,
  "body"              TEXT NOT NULL,
  "subject"           TEXT,

  -- Provider tracking
  "provider"          TEXT NOT NULL,
  "providerMessageId" TEXT,
  "providerResponse"  TEXT,

  -- Status + retry
  "status"        "MessageStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextRetryAt"   TIMESTAMP(3),
  "deliveredAt"   TIMESTAMP(3),
  "failureReason" TEXT,

  -- Timestamps
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for Message
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
