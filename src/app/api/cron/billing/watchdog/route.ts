/**
 * /api/cron/billing/watchdog
 *
 * BillingCharge stuck-PENDING monitor. READ-ONLY — makes no DB mutations.
 *
 * Scans for BillingCharge rows that have been in PENDING status longer than
 * expected and fires Sentry alerts so the on-call engineer can investigate.
 *
 * ── Two Sentry alert levels ───────────────────────────────────────────────────
 *
 *   "warning"  — age > BILLING_WATCHDOG_ALERT_MINUTES   (default: 30 min)
 *                May still be processing if billing cron is mid-flight.
 *                No immediate action required; monitor for escalation.
 *
 *   "error"    — age > BILLING_WATCHDOG_CRITICAL_HOURS  (default: 2 h)
 *                Almost certainly stuck. Admin must inspect the provider dashboard
 *                for the BillingCharge.id (used as the charge Order/identifier),
 *                verify whether the provider charged the card, and manually update
 *                the BillingCharge row (FAILED or SUCCEEDED).
 *
 * ── Why no auto-fail ─────────────────────────────────────────────────────────
 *   See src/lib/billing/watchdog.ts for the full rationale.
 *   Short version: auto-failing without HYP verification risks double-charging
 *   the customer. Human verification is required before resolving stuck charges.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 *   GET  — Vercel cron handler (runs daily at 10:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Manual test:
 *            curl https://www.signdeal.co.il/api/cron/billing/watchdog \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Manual test:
 *            curl -X POST https://www.signdeal.co.il/api/cron/billing/watchdog \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response codes ────────────────────────────────────────────────────────────
 *   200 — Scan complete (always, even when stuck charges are found).
 *         Sentry alerts are fired for any stuck charges regardless.
 *         The response body includes stuckCharges[] for the caller to log.
 *   500 — Unexpected error during the scan itself.
 *   401 — Unauthorized.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CRON_SECRET                         — shared secret for cron route authentication
 *   BILLING_WATCHDOG_ALERT_MINUTES      — warning threshold in minutes (default: 30)
 *   BILLING_WATCHDOG_CRITICAL_HOURS     — error threshold in hours (default: 2)
 */

import { NextResponse }              from "next/server";
import { timingSafeEqual }           from "crypto";
import * as Sentry                   from "@sentry/nextjs";
import { requireAdmin }              from "@/lib/require-admin";
import { runBillingChargeWatchdog }  from "@/lib/billing/watchdog";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runWatchdog(triggeredBy: string): Promise<NextResponse> {
  console.log(
    `[/api/cron/billing/watchdog] triggered by ${triggeredBy}` +
    ` at=${new Date().toISOString()}`,
  );

  try {
    const result = await runBillingChargeWatchdog();

    console.log(
      `[/api/cron/billing/watchdog] complete` +
      ` totalStuck=${result.totalStuck}` +
      ` alertCount=${result.alertCount}` +
      ` criticalCount=${result.criticalCount}`,
    );

    // Always 200 — this is a monitoring endpoint.
    // Sentry alerts were already fired inside runBillingChargeWatchdog().
    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    console.error("[/api/cron/billing/watchdog] unexpected error:", err);
    Sentry.captureException(err, {
      tags:  { component: "billing_watchdog_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "Billing watchdog job failed — check server logs" },
      { status: 500 },
    );
  }
}

// ── GET — Vercel cron (CRON_SECRET auth) ─────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const expected   = `Bearer ${cronSecret ?? ""}`;

  const authorized =
    !!cronSecret &&
    authHeader.length === expected.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

  if (!authorized) {
    console.warn(
      `[/api/cron/billing/watchdog GET] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runWatchdog("cron");
}

// ── POST — Manual admin trigger (session-cookie auth) ─────────────────────────

export async function POST(_request: Request): Promise<NextResponse> {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  return runWatchdog(`admin:${adminResult.adminId}`);
}
