/**
 * @/lib/billing/watchdog — BillingCharge stuck-PENDING detector.
 *
 * Monitors BillingCharge rows that have been in PENDING status longer than
 * expected. A PENDING row that lives beyond the HYP timeout window (15 seconds)
 * is either:
 *   a) A process that crashed before writing the result to DB.
 *   b) A process that is still running (rare — only if the Vercel function
 *      timeout is very long and the billing cron is mid-flight).
 *
 * ── What this does ────────────────────────────────────────────────────────────
 *   READ-ONLY monitoring. No DB mutations.
 *
 *   Sentry alert at "warning" level when age > ALERT_THRESHOLD_MINUTES (30 min).
 *   Sentry alert at "error"   level when age > CRITICAL_THRESHOLD_HOURS (2 h).
 *
 *   A PENDING charge older than 2 hours is almost certainly stuck — the HYP
 *   action=soft call completes in < 15 seconds and the Vercel function timeout
 *   is 300 seconds. An admin must inspect the HYP dashboard and manually
 *   resolve the BillingCharge row (update to FAILED or SUCCEEDED).
 *
 * ── Why no auto-fail ──────────────────────────────────────────────────────────
 *   Auto-resolving to FAILED without verifying the HYP outcome is financially
 *   dangerous. If HYP processed the charge but the response was lost in transit
 *   (timeout), auto-failing would:
 *     1. Mark the charge FAILED (incorrect — user was charged).
 *     2. Allow the billing cron to retry on the next run.
 *     3. Charge the user a second time for the same billing period.
 *
 *   Until a HYP transaction-verification endpoint is integrated, the safest
 *   action is to alert and require human verification. The unique constraint on
 *   BillingCharge(subscriptionId, periodStart) prevents a new charge row from
 *   being created for the same period while the PENDING row exists, so the
 *   stuck PENDING row acts as a natural lock on that subscription's billing.
 *
 * ── Thresholds (env-overridable) ─────────────────────────────────────────────
 *   BILLING_WATCHDOG_ALERT_MINUTES    (default: 30) — Sentry warning threshold
 *   BILLING_WATCHDOG_CRITICAL_HOURS   (default: 2)  — Sentry error threshold
 */

import { prisma }   from "@/lib/prisma";
import * as Sentry  from "@sentry/nextjs";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minutes after creation before a PENDING charge is considered stuck. */
const ALERT_THRESHOLD_MINUTES: number = (() => {
  const v = parseInt(process.env.BILLING_WATCHDOG_ALERT_MINUTES ?? "", 10);
  return isNaN(v) || v < 1 ? 30 : v;
})();

/** Hours after creation before a PENDING charge is considered critically stuck. */
const CRITICAL_THRESHOLD_HOURS: number = (() => {
  const v = parseInt(process.env.BILLING_WATCHDOG_CRITICAL_HOURS ?? "", 10);
  return isNaN(v) || v < 1 ? 2 : v;
})();

// ── Result types ──────────────────────────────────────────────────────────────

export type WatchdogSentryLevel = "warning" | "error";

export interface StuckCharge {
  chargeId:       string;
  subscriptionId: string;
  userId:         string;
  ageMinutes:     number;
  sentryLevel:    WatchdogSentryLevel;
  periodStart:    string;   // ISO — identifies which billing period is blocked
  attemptNumber:  number;
}

export interface WatchdogResult {
  ranAt:         string;   // ISO timestamp
  /** Charges in alert range [ALERT_THRESHOLD, CRITICAL_THRESHOLD). */
  alertCount:    number;
  /** Charges at or beyond the critical threshold. */
  criticalCount: number;
  /** Total stuck charges found (alertCount + criticalCount). */
  totalStuck:    number;
  stuckCharges:  StuckCharge[];
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runBillingChargeWatchdog(): Promise<WatchdogResult> {
  const now           = new Date();
  const alertCutoff   = new Date(now.getTime() - ALERT_THRESHOLD_MINUTES * 60 * 1000);
  const criticalCutoff = new Date(now.getTime() - CRITICAL_THRESHOLD_HOURS * 60 * 60 * 1000);

  console.log(
    `[billing/watchdog] WATCHDOG_START` +
    ` at=${now.toISOString()}` +
    ` alertCutoff=${alertCutoff.toISOString()}` +
    ` criticalCutoff=${criticalCutoff.toISOString()}`,
  );

  // Find all PENDING charges older than the alert threshold.
  // This includes both "warning" and "critical" age ranges in one query.
  const stuckRows = await prisma.billingCharge.findMany({
    where: {
      status:    "PENDING",
      createdAt: { lt: alertCutoff },
    },
    select: {
      id:             true,
      subscriptionId: true,
      userId:         true,
      createdAt:      true,
      periodStart:    true,
      attemptNumber:  true,
    },
    orderBy: { createdAt: "asc" },  // oldest first — most critical surfaced first in logs
  });

  console.log(
    `[billing/watchdog] WATCHDOG_SCAN_RESULT stuckCount=${stuckRows.length}` +
    ` alertThresholdMinutes=${ALERT_THRESHOLD_MINUTES}` +
    ` criticalThresholdHours=${CRITICAL_THRESHOLD_HOURS}`,
  );

  if (stuckRows.length === 0) {
    return {
      ranAt:         now.toISOString(),
      alertCount:    0,
      criticalCount: 0,
      totalStuck:    0,
      stuckCharges:  [],
    };
  }

  const stuckCharges: StuckCharge[] = [];
  let alertCount    = 0;
  let criticalCount = 0;

  for (const row of stuckRows) {
    const ageMs      = now.getTime() - row.createdAt.getTime();
    const ageMinutes = Math.floor(ageMs / 60_000);
    const isCritical = row.createdAt < criticalCutoff;
    const sentryLevel: WatchdogSentryLevel = isCritical ? "error" : "warning";

    if (isCritical) criticalCount++;
    else            alertCount++;

    const stuckCharge: StuckCharge = {
      chargeId:       row.id,
      subscriptionId: row.subscriptionId,
      userId:         row.userId,
      ageMinutes,
      sentryLevel,
      periodStart:    row.periodStart.toISOString(),
      attemptNumber:  row.attemptNumber,
    };
    stuckCharges.push(stuckCharge);

    // ── Sentry alert per stuck charge ──────────────────────────────────────
    // Each stuck charge fires its own Sentry event so the on-call engineer
    // can see exactly which charge ID and subscription are affected.
    // Tags are kept minimal — no PII, no card data.
    const sentryMessage = isCritical
      ? `[billing-watchdog] CRITICAL: BillingCharge stuck PENDING for ${ageMinutes} minutes — admin action required`
      : `[billing-watchdog] WARNING: BillingCharge stuck PENDING for ${ageMinutes} minutes`;

    Sentry.captureMessage(sentryMessage, {
      level: sentryLevel,
      tags:  {
        component:    "billing_watchdog",
        sentryLevel,
      },
      extra: {
        chargeId:       row.id,
        subscriptionId: row.subscriptionId,
        userId:         row.userId,
        ageMinutes,
        periodStart:    row.periodStart.toISOString(),
        attemptNumber:  row.attemptNumber,
        createdAt:      row.createdAt.toISOString(),
        resolution:     isCritical
          ? "Inspect HYP dashboard for this Order ID, then manually update BillingCharge status."
          : "Monitor — may still be processing if billing cron is mid-flight.",
      },
    });

    console.warn(
      `[billing/watchdog] STUCK_CHARGE` +
      ` level=${sentryLevel}` +
      ` chargeId=${row.id}` +
      ` subscriptionId=${row.subscriptionId}` +
      ` ageMinutes=${ageMinutes}` +
      ` periodStart=${row.periodStart.toISOString()}` +
      ` attemptNumber=${row.attemptNumber}`,
    );
  }

  // ── Summary Sentry alert when multiple critical charges found ─────────────
  if (criticalCount > 1) {
    Sentry.captureMessage(
      `[billing-watchdog] ${criticalCount} BillingCharge rows critically stuck — immediate investigation required`,
      {
        level: "error",
        tags:  { component: "billing_watchdog" },
        extra: {
          criticalCount,
          alertCount,
          totalStuck: stuckRows.length,
        },
      },
    );
  }

  console.log(
    `[billing/watchdog] WATCHDOG_COMPLETE` +
    ` totalStuck=${stuckRows.length}` +
    ` alertCount=${alertCount}` +
    ` criticalCount=${criticalCount}`,
  );

  return {
    ranAt:         now.toISOString(),
    alertCount,
    criticalCount,
    totalStuck:    stuckRows.length,
    stuckCharges,
  };
}

// Re-export thresholds for use in tests.
export { ALERT_THRESHOLD_MINUTES, CRITICAL_THRESHOLD_HOURS };
