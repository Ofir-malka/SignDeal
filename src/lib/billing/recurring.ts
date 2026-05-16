/**
 * @/lib/billing/recurring — recurring billing engine.
 *
 * Called by the Vercel cron at /api/cron/billing/charge (daily, 06:00 UTC).
 * Can also be triggered manually for testing.
 *
 * ── Phase 3B (current): DRY-RUN stub ─────────────────────────────────────────
 * Scans subscriptions that are due for billing and logs which ones WOULD be
 * charged. Makes no HYP calls and writes no BillingCharge rows.
 *
 * ── Phase 3C (next): real action=soft charges ─────────────────────────────────
 * Replace the WOULD_CHARGE log block with callHypSoft(sub.chargeToken, …),
 * create a BillingCharge row for each attempt, and update Subscription fields:
 *   - On success: status → ACTIVE, nextBillingAt → periodEnd, billingFailures = 0
 *   - On failure: billingFailures++, nextBillingAt → retryDate
 *                 After MAX_FAILURES: status → PAST_DUE / EXPIRED
 *
 * ── Eligibility criteria ─────────────────────────────────────────────────────
 *   status         IN (TRIALING, ACTIVE, PAST_DUE)
 *   nextBillingAt  <= now()
 *   chargeToken    IS NOT NULL        ← 19-digit token from Phase 3A getToken
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 * Each successful charge advances nextBillingAt by one billing period, so
 * running the cron twice in the same window produces no double-charges.
 * (Phase 3C: use the BillingCharge row's periodStart as an additional guard.)
 */

import { prisma } from "@/lib/prisma";

// ── Result shape returned to the cron route ───────────────────────────────────

export interface RecurringChargeResult {
  /** Total subscriptions where nextBillingAt <= now, regardless of chargeToken. */
  eligible:    number;
  /** Subset with a chargeToken — these WOULD be charged in Phase 3C. */
  wouldCharge: number;
  /** Subscriptions due but missing chargeToken — cannot charge; needs investigation. */
  noToken:     number;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function processRecurringCharges(): Promise<RecurringChargeResult> {
  const now = new Date();

  console.log(
    `[billing/recurring] SCAN_START` +
    ` at=${now.toISOString()}`,
  );

  // ── Query 1: due + has chargeToken (ready for Phase 3C) ─────────────────────
  const dueWithToken = await prisma.subscription.findMany({
    where: {
      status:        { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      nextBillingAt: { lte: now },
      chargeToken:   { not: null },
    },
    select: {
      id:              true,
      userId:          true,
      plan:            true,
      billingInterval: true,
      status:          true,
      nextBillingAt:   true,
      billingFailures: true,
      cardExpMonth:    true,
      cardExpYear:     true,
      // chargeToken intentionally NOT selected — never log it
    },
  });

  // ── Query 2: due but no chargeToken (cannot charge — needs investigation) ────
  const noTokenCount = await prisma.subscription.count({
    where: {
      status:        { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      nextBillingAt: { lte: now },
      chargeToken:   null,
    },
  });

  const eligible = dueWithToken.length + noTokenCount;

  console.log(
    `[billing/recurring] SCAN_RESULT` +
    ` eligible=${eligible}` +
    ` wouldCharge=${dueWithToken.length}` +
    ` noToken=${noTokenCount}`,
  );

  // ── Dry-run: log each subscription that WOULD be charged ─────────────────────
  // Phase 3C replaces this block with real action=soft calls.
  for (const sub of dueWithToken) {
    console.log(
      `[billing/recurring] WOULD_CHARGE` +
      ` subscriptionId=${sub.id}` +
      ` userId=${sub.userId}` +
      ` plan=${sub.plan}` +
      ` interval=${sub.billingInterval}` +
      ` status=${sub.status}` +
      ` nextBillingAt=${sub.nextBillingAt?.toISOString() ?? "(null)"}` +
      ` billingFailures=${sub.billingFailures}` +
      ` cardExpMonth=${sub.cardExpMonth ?? "(none)"}` +
      ` cardExpYear=${sub.cardExpYear ?? "(none)"}` +
      ` — Phase 3C will execute action=soft charge here`,
    );
  }

  // ── Warn about subscriptions due but missing chargeToken ─────────────────────
  if (noTokenCount > 0) {
    console.warn(
      `[billing/recurring] NO_TOKEN_WARNING` +
      ` count=${noTokenCount}` +
      ` — subscriptions are due for billing but have no chargeToken.` +
      ` Check Phase 3A getToken results for these users.`,
    );
  }

  console.log(
    `[billing/recurring] SCAN_COMPLETE` +
    ` wouldCharge=${dueWithToken.length}` +
    ` noToken=${noTokenCount}`,
  );

  return {
    eligible,
    wouldCharge: dueWithToken.length,
    noToken:     noTokenCount,
  };
}
