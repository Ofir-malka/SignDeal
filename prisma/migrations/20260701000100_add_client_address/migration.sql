-- Migration: add an optional residential address to Client
--
-- Used by the rental interested-client template ("מכתובת" / {{clientAddress}}).
-- The address is completed by the client on the signing page (not by the broker
-- at creation) and is reused for future contracts to the same client.
--
-- Nullable TEXT — PostgreSQL 11+ adds a nullable column instantly, no table
-- rewrite. Backward-compatible: every existing Client row gets NULL, which
-- renders as "—" via buildContext's fallback.

ALTER TABLE "Client" ADD COLUMN "address" TEXT;
