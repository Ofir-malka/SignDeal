/**
 * /api/cron/subscriptions/expire
 *
 * Subscription expiry job. Runs two state machines in sequence:
 *
 *   1. expireTrialingSubscriptions()
 *      TRIALING → EXPIRED for users whose trial ended and have no chargeToken.
 *      Does NOT touch subscriptions that have a chargeToken — those belong to
 *      the billing cron.
 *
 *   2. expirePastDueSubscriptions()
 *      PAST_DUE → EXPIRED for users who exhausted all billing retry attempts
 *      (nextBillingAt = null) and whose grace period has elapsed.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 *   GET  — Vercel cron handler (runs daily at 08:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Runs 2 hours after the billing cron (06:00 UTC) to ensure any
 *          TRIALING subscription with a chargeToken has had at least one charge
 *          attempt before we declare it expired.
 *          Manual test:
 *            curl https://www.signdeal.co.il/api/cron/subscriptions/expire \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Manual test:
 *            curl -X POST https://www.signdeal.co.il/api/cron/subscriptions/expire \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response codes ────────────────────────────────────────────────────────────
 *   200 — All eligible subscriptions processed; zero failures.
 *   207 — Partial success: at least one subscription failed to transition.
 *   500 — Unexpected top-level error (both state machines failed to run).
 *   401 — Unauthorized.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CRON_SECRET                — shared secret for cron route authentication
 *   TRIAL_EXPIRY_GRACE_HOURS   — hours after trialEndsAt before expiry (default: 48)
 *   PAST_DUE_GRACE_DAYS        — days after PAST_DUE before expiry (default: 14)
 */

import { NextResponse }                       from "next/server";
import { timingSafeEqual }                    from "crypto";
import * as Sentry                            from "@sentry/nextjs";
import { requireAdmin }                       from "@/lib/require-admin";
import {
  expireTrialingSubscriptions,
  expirePastDueSubscriptions,
  type ExpiryResult,
}                                             from "@/lib/subscriptions/expire";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runExpiryJob(triggeredBy: string): Promise<NextResponse> {
  console.log(
    `[/api/cron/subscriptions/expire] triggered by ${triggeredBy}` +
    ` at=${new Date().toISOString()}`,
  );

  let trialResult:   ExpiryResult | null = null;
  let pastDueResult: ExpiryResult | null = null;

  try {
    // ── 1. TRIALING → EXPIRED ─────────────────────────────────────────────────
    trialResult = await expireTrialingSubscriptions();

    // ── 2. PAST_DUE → EXPIRED ────────────────────────────────────────────────
    pastDueResult = await expirePastDueSubscriptions();

  } catch (err) {
    console.error("[/api/cron/subscriptions/expire] unexpected top-level error:", err);
    Sentry.captureException(err, {
      tags:  { component: "subscription_expiry_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "Subscription expiry job failed — check server logs" },
      { status: 500 },
    );
  }

  const totalFailed = (trialResult?.failed ?? 0) + (pastDueResult?.failed ?? 0);

  // Fire a Sentry warning when any subscription failed to transition.
  // Individual PAST_DUE→EXPIRED expiries already fire their own error-level
  // Sentry events inside the lib. This is the summary-level alert.
  if (totalFailed > 0) {
    Sentry.captureMessage(
      `[subscription-expiry-cron] ${totalFailed} subscription(s) failed to expire`,
      {
        level: "warning",
        tags:  { component: "subscription_expiry_cron" },
        extra: {
          trialFailed:   trialResult?.failed   ?? 0,
          pastDueFailed: pastDueResult?.failed ?? 0,
          trialExpired:  trialResult?.expired  ?? 0,
          pastDueExpired: pastDueResult?.expired ?? 0,
        },
      },
    );
  }

  console.log(
    `[/api/cron/subscriptions/expire] complete` +
    ` trial.expired=${trialResult.expired} trial.failed=${trialResult.failed}` +
    ` pastDue.expired=${pastDueResult.expired} pastDue.failed=${pastDueResult.failed}`,
  );

  const status = totalFailed > 0 ? 207 : 200;

  return NextResponse.json(
    {
      ok:       status === 200,
      trial:    trialResult,
      pastDue:  pastDueResult,
    },
    { status },
  );
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
      `[/api/cron/subscriptions/expire GET] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runExpiryJob("cron");
}

// ── POST — Manual admin trigger (session-cookie auth) ─────────────────────────

export async function POST(_request: Request): Promise<NextResponse> {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  return runExpiryJob(`admin:${adminResult.adminId}`);
}
