-- Phase E — Operational Safety: New MessageType enum values
--
-- Adds two new MessageType values for subscription lifecycle emails:
--   TRIAL_EXPIRED          — broker notification when trial ends without a payment method
--   SUBSCRIPTION_SUSPENDED — broker notification when subscription moves to EXPIRED
--                            after PAST_DUE grace period exhausted
--
-- PostgreSQL note: ALTER TYPE ... ADD VALUE cannot be executed inside a
-- transaction block. Prisma runs migrations in transactions by default.
-- This migration must be run with --skip-generate OR the Prisma migration
-- engine handles it outside a transaction automatically (Prisma v5+).
--
-- If running manually via psql, execute this file outside a BEGIN/COMMIT block:
--   psql $DATABASE_URL -f migration.sql
--
-- These values are additive — no existing rows are affected.
-- Rollback is not possible for enum additions in PostgreSQL; removal
-- requires a new migration that drops the value (requires no existing rows
-- use it, plus a table rewrite in older PG versions).

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'TRIAL_EXPIRED';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_SUSPENDED';
