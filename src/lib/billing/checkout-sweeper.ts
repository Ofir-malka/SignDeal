/**
 * @/lib/billing/checkout-sweeper — BillingCheckout stale-PENDING sweeper.
 *
 * Finds BillingCheckout rows that are still PENDING after their expiresAt has
 * elapsed (plus a configurable buffer) and marks them EXPIRED. Writes an
 * AuditLog entry for every checkout that is successfully expired.
 *
 * ── Why a buffer? ──────────────────────────────────────────────────────────────
 *   A user may be actively completing payment on the HYP hosted page at the
 *   exact moment their BillingCheckout.expiresAt is reached. To avoid expiring
 *   that checkout and causing the /billing/success handler to see a non-PENDING
 *   row, we add a 30-minute buffer so that expiresAt + 30 min must have passed
 *   before we touch the row.
 *
 *   The /billing/success success handler already uses an atomic
 *   `updateMany WHERE status = "PENDING"` guard — any checkout the sweeper
 *   expires before the HYP callback arrives will return count=0 and the handler
 *   will treat it as ALREADY_PROCESSED. This is the fallback if the buffer is
 *   not enough (e.g., HYP is very slow).
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *   Each checkout is updated with `updateMany WHERE id = X AND status = PENDING`.
 *   If a concurrent process (HYP callback) already resolved the checkout, the
 *   update matches 0 rows → skipped_race. No duplicate audit log. No error.
 *
 * ── No SubscriptionEvent ──────────────────────────────────────────────────────
 *   BillingCheckout has no subscriptionId field — it is linked only via userId
 *   and order. A SubscriptionEvent would require a fragile join on userId +
 *   plan/interval, which could match the wrong subscription during plan changes.
 *   The AuditLog entry (keyed on checkoutId) is the canonical record.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CHECKOUT_SWEEPER_BUFFER_MINUTES — minutes beyond expiresAt before expiry
 *                                     fires (default: 30)
 */

import { prisma }          from "@/lib/prisma";
import * as Sentry         from "@sentry/nextjs";
import { logAuditEvent }   from "@/lib/audit/log-audit-event";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Grace buffer in minutes beyond expiresAt.
 * A checkout is only swept after `expiresAt + EXPIRY_BUFFER_MINUTES` has passed.
 */
const EXPIRY_BUFFER_MINUTES: number = (() => {
  const v = parseInt(process.env.CHECKOUT_SWEEPER_BUFFER_MINUTES ?? "", 10);
  return isNaN(v) || v < 0 ? 30 : v;
})();

// ── Result types ──────────────────────────────────────────────────────────────

export type SweeperOutcome = "expired" | "skipped_race" | "failed";

export interface SweeperDetail {
  checkoutId: string;
  userId:     string;
  order:      string;
  outcome:    SweeperOutcome;
  reason?:    string;
}

export interface SweeperResult {
  ranAt:     string;   // ISO timestamp
  processed: number;   // total stale rows found
  swept:     number;   // successfully set to EXPIRED
  skipped:   number;   // race-condition skips (already resolved by HYP callback)
  failed:    number;   // unexpected errors
  details:   SweeperDetail[];
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runCheckoutSweeper(): Promise<SweeperResult> {
  const now    = new Date();
  // Only target checkouts where expiresAt + buffer < now
  const cutoff = new Date(now.getTime() - EXPIRY_BUFFER_MINUTES * 60 * 1000);

  console.log(
    `[billing/checkout-sweeper] SWEEP_START` +
    ` at=${now.toISOString()}` +
    ` cutoff=${cutoff.toISOString()}` +
    ` bufferMinutes=${EXPIRY_BUFFER_MINUTES}`,
  );

  // One query fetches all eligible rows. The per-row transaction below provides
  // the actual idempotency guard — this scan is just the candidate list.
  const staleRows = await prisma.billingCheckout.findMany({
    where: {
      status:    "PENDING",
      expiresAt: { lt: cutoff },
    },
    select: {
      id:        true,
      userId:    true,
      order:     true,
      plan:      true,
      interval:  true,
      purpose:   true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { expiresAt: "asc" },  // oldest first — most overdue surfaced first in logs
  });

  console.log(
    `[billing/checkout-sweeper] SWEEP_SCAN staleCount=${staleRows.length}` +
    ` bufferMinutes=${EXPIRY_BUFFER_MINUTES}`,
  );

  if (staleRows.length === 0) {
    return {
      ranAt:     now.toISOString(),
      processed: 0,
      swept:     0,
      skipped:   0,
      failed:    0,
      details:   [],
    };
  }

  const details: SweeperDetail[] = [];
  let swept   = 0;
  let skipped = 0;
  let failed  = 0;

  for (const row of staleRows) {
    try {
      // Atomic status guard: only transitions PENDING → EXPIRED.
      // If the HYP callback already moved this row to SUCCEEDED/FAILED, count === 0.
      const { count } = await prisma.$transaction(async (tx) => {
        return tx.billingCheckout.updateMany({
          where: { id: row.id, status: "PENDING" },
          data:  { status: "EXPIRED", resolvedAt: now },
        });
      });

      if (count === 0) {
        // Concurrent resolution (HYP callback or another sweeper run) already
        // moved this row. Safe to skip — no audit log, no error.
        console.log(
          `[billing/checkout-sweeper] SKIPPED_RACE` +
          ` checkoutId=${row.id} order=${row.order}`,
        );
        skipped++;
        details.push({
          checkoutId: row.id,
          userId:     row.userId,
          order:      row.order,
          outcome:    "skipped_race",
        });
        continue;
      }

      swept++;
      details.push({
        checkoutId: row.id,
        userId:     row.userId,
        order:      row.order,
        outcome:    "expired",
      });

      console.log(
        `[billing/checkout-sweeper] EXPIRED` +
        ` checkoutId=${row.id}` +
        ` order=${row.order}` +
        ` expiresAt=${row.expiresAt.toISOString()}`,
      );

      // Audit log — non-blocking (logAuditEvent never throws).
      // Metadata: only non-PII fields. No card data, no email.
      await logAuditEvent({
        userId:     null,   // system/cron action — no human actor
        action:     "billing_checkout.expired",
        entityType: "billing_checkout",
        entityId:   row.id,
        metadata: {
          order:     row.order,
          userId:    row.userId,   // owner reference (not PII in audit context)
          plan:      row.plan,
          interval:  row.interval,
          purpose:   row.purpose,
          expiresAt: row.expiresAt.toISOString(),
          expiredAt: now.toISOString(),
        },
      });

    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      details.push({
        checkoutId: row.id,
        userId:     row.userId,
        order:      row.order,
        outcome:    "failed",
        reason,
      });
      console.error(
        `[billing/checkout-sweeper] FAIL checkoutId=${row.id} order=${row.order}:`,
        err,
      );
      Sentry.captureException(err, {
        tags:  { component: "billing_checkout_sweeper" },
        level: "error",
        extra: {
          checkoutId: row.id,
          order:      row.order,
          userId:     row.userId,
        },
      });
    }
  }

  // Summary Sentry alert when any rows could not be expired.
  if (failed > 0) {
    Sentry.captureMessage(
      `[checkout-sweeper] ${failed} BillingCheckout row(s) failed to expire`,
      {
        level: "warning",
        tags:  { component: "billing_checkout_sweeper" },
        extra: {
          swept,
          skipped,
          failed,
          total: staleRows.length,
        },
      },
    );
  }

  console.log(
    `[billing/checkout-sweeper] SWEEP_COMPLETE` +
    ` swept=${swept} skipped=${skipped} failed=${failed}`,
  );

  return {
    ranAt:     now.toISOString(),
    processed: staleRows.length,
    swept,
    skipped,
    failed,
    details,
  };
}

// Re-export threshold for use in tests.
export { EXPIRY_BUFFER_MINUTES };
