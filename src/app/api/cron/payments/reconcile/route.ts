/**
 * /api/cron/payments/reconcile
 *
 * Stale PENDING payment reconciliation cron.
 *
 * Finds Payment rows stuck in PENDING because a Stripe webhook was missed,
 * then corrects their state by querying Stripe directly.
 *
 * ── When this matters ─────────────────────────────────────────────────────────
 * Stripe delivers checkout.session.completed / checkout.session.expired
 * at-least-once, but a cold-start Vercel crash, a DB timeout during the
 * webhook handler, or a brief Stripe delivery failure can leave a Payment row
 * permanently PENDING even after the session is resolved.
 *
 * Effect on brokers: the Payment row stays PENDING, the Contract stays
 * PAYMENT_PENDING, and the broker cannot create a new payment request because
 * the creation guard returns the stale PENDING row.
 *
 * ── What it corrects ─────────────────────────────────────────────────────────
 * Payment rows where:
 *   status                  = PENDING
 *   stripeCheckoutSessionId IS NOT NULL
 *   createdAt               < (now − 25 hours)
 *
 * For each:
 *   Stripe session = "open"     → still live; skip.
 *   Stripe session = "expired"  → Payment = CANCELED (broker can re-request).
 *   Stripe session = "complete" → Payment = PAID, Contract = PAID (full recovery).
 *   Stripe API error            → Sentry alert; skip row; continue others.
 *
 * See src/lib/payments/reconcile.ts for full implementation notes.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *   GET  — Vercel cron handler (runs daily at 12:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Manual test:
 *            curl https://app.signdeal.co.il/api/cron/payments/reconcile \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Manual test:
 *            curl -X POST https://app.signdeal.co.il/api/cron/payments/reconcile \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response codes ────────────────────────────────────────────────────────────
 *   200 — Job complete. Body includes inspected, correctedComplete,
 *         correctedExpired, skippedOpen, failures, details[].
 *         Always 200 even when corrections were made — failures per-row are
 *         captured in Sentry and included in details[].
 *   401 — Unauthorized (cron secret missing or wrong; admin not authenticated).
 *   500 — Unexpected top-level error (the job itself crashed).
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CRON_SECRET      — shared secret for Vercel cron auth
 *   STRIPE_SECRET_KEY + STRIPE_PAYMENT_WEBHOOK_SECRET — required by getStripeClient
 *   PAYMENT_PROVIDER — must be "stripe"; if not, job returns 0 rows inspected
 *
 * ── Safety ────────────────────────────────────────────────────────────────────
 *   • Each row is processed independently — one failure does not abort others.
 *   • All DB updates use a `status = "PENDING"` guard → idempotent.
 *   • The "complete" recovery path uses $transaction (Payment + Contract atomic).
 *   • Running the cron twice for the same row is safe.
 */

import { NextResponse }                  from "next/server";
import { timingSafeEqual }               from "crypto";
import * as Sentry                       from "@sentry/nextjs";
import { requireAdmin }                  from "@/lib/require-admin";
import { runPaymentReconciliation }      from "@/lib/payments/reconcile";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runReconcile(triggeredBy: string): Promise<NextResponse> {
  console.log(
    `[/api/cron/payments/reconcile] triggered by ${triggeredBy}` +
    ` at=${new Date().toISOString()}`,
  );

  try {
    const result = await runPaymentReconciliation();

    console.log(
      `[/api/cron/payments/reconcile] complete` +
      ` inspected=${result.inspected}` +
      ` correctedComplete=${result.correctedComplete}` +
      ` correctedExpired=${result.correctedExpired}` +
      ` skippedOpen=${result.skippedOpen}` +
      ` failures=${result.failures}`,
    );

    // Always 200 — per-row failures are in Sentry and in result.details[].
    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    console.error("[/api/cron/payments/reconcile] unexpected top-level error:", err);
    Sentry.captureException(err, {
      tags:  { component: "payment_reconcile_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "Payment reconciliation job failed — check server logs" },
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
      `[/api/cron/payments/reconcile GET] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runReconcile("cron");
}

// ── POST — Manual admin trigger (session-cookie auth) ─────────────────────────

export async function POST(_request: Request): Promise<NextResponse> {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  return runReconcile(`admin:${adminResult.adminId}`);
}
