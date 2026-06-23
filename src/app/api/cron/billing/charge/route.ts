/**
 * GET /api/cron/billing/charge
 *
 * Vercel cron endpoint — runs daily at 06:00 UTC per vercel.json.
 * Calls processRecurringCharges() to find and (in Phase 3C) charge subscriptions.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 * Vercel automatically injects:
 *   Authorization: Bearer <CRON_SECRET>
 * on every cron invocation. The same header must be sent for manual testing.
 * Requests without a valid Bearer token are rejected with 401.
 *
 * ── Phase 3B (current) ────────────────────────────────────────────────────────
 * processRecurringCharges() is a dry-run stub — it logs which subscriptions
 * WOULD be charged but makes no HYP calls and writes no BillingCharge rows.
 *
 * ── Phase 3C (next) ───────────────────────────────────────────────────────────
 * processRecurringCharges() will execute real action=soft charges and write
 * BillingCharge rows. The route handler needs no changes.
 *
 * ── Manual trigger ────────────────────────────────────────────────────────────
 *   curl -X GET https://www.signdeal.co.il/api/cron/billing/charge \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 *
 * ── Env vars required ─────────────────────────────────────────────────────────
 *   CRON_SECRET — random secret set in Vercel project settings.
 *                 Must match the value Vercel uses for cron auth.
 */

import { NextResponse }             from "next/server";
import { timingSafeEqual }          from "crypto";
import * as Sentry                  from "@sentry/nextjs";
import { processRecurringCharges }  from "@/lib/billing/recurring";

export async function GET(request: Request) {
  // ── Auth: require Bearer CRON_SECRET (timing-safe comparison) ───────────
  // timingSafeEqual requires equal-length buffers — length pre-check is safe
  // since it only reveals the length of the expected value, not its content.
  const cronSecret  = process.env.CRON_SECRET?.trim();
  const authHeader  = request.headers.get("authorization") ?? "";
  const expected    = `Bearer ${cronSecret ?? ""}`;

  const authorized =
    !!cronSecret &&
    authHeader.length === expected.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

  if (!authorized) {
    console.warn(
      `[cron/billing/charge] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[cron/billing/charge] TRIGGERED at=${new Date().toISOString()}`);

  try {
    const result = await processRecurringCharges();

    console.log(
      `[cron/billing/charge] COMPLETE` +
      ` eligible=${result.eligible}` +
      ` charged=${result.charged}` +
      ` failed=${result.failed}` +
      ` errored=${result.errored}` +
      ` skipped=${result.skipped}` +
      ` dryRunMode=${result.dryRunMode}` +
      ` realChargesEnabled=${result.realChargesEnabled}` +
      ` recurringProvider=${result.recurringProvider}` +
      ` growRecurringEnabled=${result.growRecurringEnabled}` +
      ` byProvider=${JSON.stringify(result.byProvider)}`,
    );

    // Alert on DECLINED charges — revenue-impacting (card refused). Counts only; no PII.
    if (result.failed > 0) {
      Sentry.captureMessage(
        `[billing-cron] ${result.failed} declined charge(s) out of ${result.eligible} eligible`,
        {
          level: "error",
          tags:  { component: "billing_cron", kind: "declines" },
          extra: {
            eligible:   result.eligible,
            charged:    result.charged,
            failed:     result.failed,
            errored:    result.errored,
            skipped:    result.skipped,
            dryRunMode: result.dryRunMode,
            byProvider: result.byProvider,
            growRecurringEnabled: result.growRecurringEnabled,
          },
        },
      );
    }

    // Separate alert on INTEGRATION ERRORS (config/transport/token) — our fault, NOT a card
    // decline. Distinct signal so ops triage these differently (no customer dunning happened).
    if (result.errored > 0) {
      Sentry.captureMessage(
        `[billing-cron] ${result.errored} integration error(s) (config/transport/token) — investigate`,
        {
          level: "error",
          tags:  { component: "billing_cron", kind: "integration_error" },
          extra: {
            errored:    result.errored,
            byProvider: result.byProvider,
            growRecurringEnabled: result.growRecurringEnabled,
          },
        },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      `[cron/billing/charge] ERROR:`,
      err instanceof Error ? err.message : err,
    );
    // Fatal — the entire cron job crashed; every eligible subscription was skipped.
    Sentry.captureException(err, {
      tags:  { component: "billing_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "Billing charge job failed — check server logs" },
      { status: 500 },
    );
  }
}
