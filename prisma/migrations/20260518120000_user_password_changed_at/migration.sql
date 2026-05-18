-- Migration: 20260518120000_user_password_changed_at
--
-- Adds passwordChangedAt to User.
-- Used by the Auth.js JWT callback to invalidate sessions that predate a
-- password reset (P0 security fix — session invalidation after password reset).
--
-- Safe to apply to production with users in flight:
--   • Column is nullable — all existing rows get NULL (no default, no backfill needed).
--   • NULL = "password was never reset via the reset flow" → no invalidation.
--   • First reset after deploy stamps the timestamp; subsequent sign-ins store
--     it in the JWT; old sessions are invalidated on the next auth() call.

ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
