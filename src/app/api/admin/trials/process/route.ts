/**
 * POST /api/admin/trials/process
 *
 * Admin-only trigger for the trial-ending reminder email job.
 * Scans TRIALING subscriptions in the 3-day and 1-day reminder windows
 * and sends emails, recording a SubscriptionEvent per sent reminder to
 * prevent duplicates on subsequent runs.
 *
 * ── Current usage ────────────────────────────────────────────────────────────
 *   curl -X POST https://signdeal.co.il/api/admin/trials/process \
 *     -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Future cron integration ───────────────────────────────────────────────────
 *   1. Add to vercel.json:
 *      { "crons": [{ "path": "/api/admin/trials/process", "schedule": "0 8 * * *" }] }
 *   2. Swap requireAdmin() for a Vercel cron-signature verifier so the cron
 *      can call the endpoint without a session cookie.
 *   3. processTrialReminders() itself needs no changes.
 */
import { NextResponse }          from "next/server";
import { requireAdmin }          from "@/lib/require-admin";
import { processTrialReminders } from "@/lib/trials/reminder";

export async function POST(_request: Request) {
  // ── Admin gate ────────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;
  const { adminId } = adminResult;

  console.log(`[POST /api/admin/trials/process] triggered by admin ${adminId}`);

  try {
    const result = await processTrialReminders();

    console.log("[POST /api/admin/trials/process] complete:", {
      processed: result.processed,
      sent:      result.sent,
      skipped:   result.skipped,
      failed:    result.failed,
    });

    // Surface a non-200 status when every eligible user failed so the caller
    // can distinguish "nothing to do" (200, sent=0, skipped=N) from
    // "something went wrong" (207, failed=N).
    const status = result.failed > 0 && result.sent === 0 ? 207 : 200;

    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("[POST /api/admin/trials/process] unexpected error:", error);
    return NextResponse.json(
      { error: "Trial reminder job failed — check server logs" },
      { status: 500 },
    );
  }
}
