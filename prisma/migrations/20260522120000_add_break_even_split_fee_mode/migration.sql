-- Migration: add BREAK_EVEN_SPLIT to FeePaidBy enum
--
-- PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block.
-- This file must be run outside a transaction (Prisma migrate deploy handles this).
-- The IF NOT EXISTS guard makes this idempotent — safe to run more than once.

ALTER TYPE "FeePaidBy" ADD VALUE IF NOT EXISTS 'BREAK_EVEN_SPLIT';
