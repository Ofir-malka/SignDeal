/**
 * /api/admin/trials/process
 *
 * Trial-ending reminder email job. Scans TRIALING subscriptions in the
 * 3-day and 1-day reminder windows, sends emails, and records a
 * SubscriptionEvent per sent reminder to prevent duplicate sends on
 * subsequent runs.
 *
 * ── Two handlers, two auth paths ─────────────────────────────────────────────
 *
 *   GET  — Vercel cron handler (runs daily at 07:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Vercel injects this header automatically on every cron invocation.
 *          For manual testing send the same header:
 *            curl https://www.signdeal.co.il/api/admin/trials/process \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Auth: valid admin session cookie (DB role re-checked, not JWT-only).
 *          For manual testing:
 *            curl -X POST https://signdeal.co.il/api/admin/trials/process \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Why two handlers instead of one ─────────────────────────────────────────
 * Vercel cron always sends GET. The existing POST handler (admin session) is
 * kept unchanged so existing manual-trigger workflows continue to work.
 * Both handlers call the same processTrialReminders() with no duplication.
 *
 * ── Env vars required ────────────────────────────────────────────────────────
 *   CRON_SECRET — random secret set in Vercel project settings.
 *                 Must match the value Vercel uses for cron auth.
 */
import { NextResponse }          from "next/server";
import { timingSafeEqual }       from "crypto";
import { requireAdmin }          from "@/lib/require-admin";
import { processTrialReminders } from "@/lib/trials/reminder";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runTrialReminders(triggeredBy: string): Promise<NextResponse> {
  console.log(`[/api/admin/trials/process] triggered by ${triggeredBy} at=${new Date().toISOString()}`);

  try {
    const result = await processTrialReminders();

    console.log("[/api/admin/trials/process] complete:", {
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
    console.error("[/api/admin/trials/process] unexpected error:", error);
    return NextResponse.json(
      { error: "Trial reminder job failed — check server logs" },
      { status: 500 },
    );
  }
}

// ── GET — Vercel cron (CRON_SECRET auth) ─────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  // Auth: require Bearer CRON_SECRET (timing-safe comparison).
  // Vercel injects Authorization: Bearer <CRON_SECRET> on every cron call.
  // timingSafeEqual requires equal-length buffers — the length pre-check is
  // safe here: it only reveals the expected string length, not its content.
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const expected   = `Bearer ${cronSecret ?? ""}`;

  const authorized =
    !!cronSecret &&
    authHeader.length === expected.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

  if (!authorized) {
    console.warn(
      `[/api/admin/trials/process GET] UNAUTHORIZED` +
      ` hasSecret=${Boolean(cronSecret)}` +
      ` headerPresent=${Boolean(authHeader)}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runTrialReminders("cron");
}

// ── POST — Manual admin trigger (session-cookie auth) ─────────────────────────

export async function POST(_request: Request): Promise<NextResponse> {
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  return runTrialReminders(`admin:${adminResult.adminId}`);
}
