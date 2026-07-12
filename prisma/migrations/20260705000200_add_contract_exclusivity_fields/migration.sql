-- Migration: owner-exclusive rental fields on Contract
--
-- rentalCommissionMonths — number of monthly rents (1-12) chosen by the broker;
--   set only when rentalCommissionMode = 'MONTHS'. Drives the dynamic rental fee
--   clause wording deterministically (incl. signing-route regeneration).
--
-- exclusivityStartsAt / exclusivityEndsAt — the exclusivity period referenced by
--   the legal clause "לתקופה שתחילתה ביום ... וסיומה ביום ...". Persisted so the
--   {{exclusivityStartDate}} / {{exclusivityEndDate}} placeholders regenerate
--   deterministically. UI end-date convention is inclusive day-before
--   (3 months from 01.08 -> 31.10).
--
-- All nullable — existing rows and non-owner-exclusive contracts stay NULL.
-- PostgreSQL adds nullable columns instantly, no table rewrite.

ALTER TABLE "Contract" ADD COLUMN "rentalCommissionMonths" INTEGER;

ALTER TABLE "Contract" ADD COLUMN "exclusivityStartsAt" TIMESTAMP(3);

ALTER TABLE "Contract" ADD COLUMN "exclusivityEndsAt" TIMESTAMP(3);
