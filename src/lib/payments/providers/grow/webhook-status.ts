/**
 * src/lib/payments/providers/grow/webhook-status.ts — P3b audit helper (PURE).
 *
 * Builds the WHERE clause for a WebhookEvent status write. PROCESSED is TERMINAL:
 * a later IGNORED/FAILED (a duplicate / already-paid callback that shares the same
 * eventId) must NOT downgrade it. The guard lives IN the query (not a
 * read-modify-write), so it is race-safe: a duplicate's IGNORED simply matches 0
 * rows when the row is already PROCESSED, leaving the audit record correct.
 *
 * No I/O — unit-tested. The PAID transition + idempotency are unaffected; this only
 * governs which WebhookEvent rows a status write is allowed to touch.
 */

import type { Prisma } from "@/generated/prisma";

export type WebhookStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export function webhookStatusUpdateWhere(
  provider: string,
  eventId: string,
  status: WebhookStatus,
): Prisma.WebhookEventWhereInput {
  // Writing PROCESSED is unconditional (it records the real outcome). Any other
  // status is only allowed to land on a row that is NOT already PROCESSED.
  return status === "PROCESSED"
    ? { provider, eventId }
    : { provider, eventId, status: { not: "PROCESSED" } };
}
