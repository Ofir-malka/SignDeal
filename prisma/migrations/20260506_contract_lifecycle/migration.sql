-- Add new lifecycle values to SignatureStatus enum.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE to run outside a transaction.
-- Prisma automatically wraps each ADD VALUE in its own statement.

ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'OPENED';
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "SignatureStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
