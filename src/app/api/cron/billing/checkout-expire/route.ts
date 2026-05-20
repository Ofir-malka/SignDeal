/**
 * /api/cron/billing/checkout-expire
 *
 * BillingCheckout stale-PENDING sweeper. Expires PENDING BillingCheckout rows
 * that have been pending for longer than their expiresAt + 30-minute buffer.
 *
 * ── Why a buffer? ──────────────────────────────────────────────────────────────
 *   The buffer avoids expiring a checkout where the user is actively on the HYP
 *   hosted payment page. See src/lib/billing/checkout-sweeper.ts for full
 *   rationale. The /billing/success handler's atomic status guard is the last
 *   line of defence regardless.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 *   GET  — Vercel cron handler (runs daily at 09:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Runs 1 hour after the subscription expiry cron (08:00 UTC) to ensure
 *          both jobs have had time to complete before the billing watchdog (10:00).
 *          Manual test:
 *            curl https://www.signdeal.co.il/api/cron/billing/checkout-expire \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Manual test:
 *            curl -X POST https://www.signdeal.co.il/api/cron/billing/checkout-expire \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response codes ────────────────────────────────────────────────────────────
 *   200 — All eligible checkouts processed; zero failures.
 *   207 — Partial success: at least one checkout failed to transition.
 *   500 — Unexpected top-level error (sweeper threw).
 *   401 — Unauthorized.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CRON_SECRET                       — shared secret for cron route auth
 *   CHECKOUT_SWEEPER_BUFFER_MINUTES   — buffer beyond expiresAt before sweep
 *                                       fires (default: 30)
 */

import { NextResponse }           from "next/server";
import { timingSafeEqual }        from "crypto";
import * as Sentry                from "@sentry/nextjs";
import { requireAdmin }           from "@/lib/require-admin";
import { runCheckoutSweeper }     from "@/lib/billing/checkout-sweeper";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runSweeper(triggeredBy: string): Promise<NextResponse> {
  console.log(
    `[/api/cron/billing/checkout-expire] triggered by ${triggeredBy}` +
    ` at=${new Date().toISOString()}`,
  );

  try {
    const result = await runCheckoutSweeper();

    console.log(
      `[/api/cron/billing/checkout-expire] complete` +
      ` swept=${result.swept}` +
      ` skipped=${result.skipped}` +
      ` failed=${result.failed}`,
    );

    // 207 when any row failed — signals partial success to the caller / Vercel.
    const status = result.failed > 0 ? 207 : 200;
    return NextResponse.json({ ok: status === 200, ...result }, { status });

  } catch (err) {
    console.error("[/api/cron/billing/checkout-expire] unexpected error:", err);
    Sentry.captureException(err, {
      tags:  { component: "billing_checkout_sweeper_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "BillingCheckout sweeper failed — check server logs" },
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
      `[/api/cron/billing/checkout-expire GET] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runSweeper("cron");
}

// ── POST — Manual admin trigger (session-cookie auth) ─────────────────────────

export async function POST(_request: Request): Promise<NextResponse> {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  return runSweeper(`admin:${adminResult.adminId}`);
}
