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
import { processRecurringCharges }  from "@/lib/billing/recurring";

export async function GET(request: Request) {
  // ── Auth: require Bearer CRON_SECRET ─────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader  = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
      ` wouldCharge=${result.wouldCharge}` +
      ` noToken=${result.noToken}`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      `[cron/billing/charge] ERROR:`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Billing charge job failed — check server logs" },
      { status: 500 },
    );
  }
}
