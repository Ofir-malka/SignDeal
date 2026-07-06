-- Migration: add an optional sale asking price to Contract (propertySalePrice)
--
-- For dealType = BOTH the existing propertyPrice column holds the MONTHLY RENT,
-- so the sale asking price needs its own column to be displayed in the contract
-- property table ("שכירות חודשית" + "מחיר מכירה"). Set only for BOTH contracts;
-- SALE keeps using propertyPrice as the sale/purchase price and RENTAL keeps
-- using propertyPrice as the monthly rent.
--
-- Stored in agorot (Int), matching every other money column.
--
-- Nullable — PostgreSQL adds a nullable column instantly, no table rewrite.
-- Backward-compatible: legacy BOTH rows stay NULL and the renderers hide the
-- sale-price row when the value is absent.

ALTER TABLE "Contract" ADD COLUMN "propertySalePrice" INTEGER;
