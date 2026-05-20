-- AlterEnum
-- PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Prisma CLI generates this as a separate statement automatically.
ALTER TYPE "MessageType" ADD VALUE 'SUBSCRIPTION_PAYMENT_FAILED';
