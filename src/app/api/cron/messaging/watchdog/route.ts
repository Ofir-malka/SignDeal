/**
 * /api/cron/messaging/watchdog
 *
 * Message delivery health monitor. READ-ONLY — makes no DB mutations and
 * sends no messages.
 *
 * Scans for Message rows in problematic states and fires Sentry alerts so the
 * on-call engineer can investigate delivery failures before they escalate.
 *
 * ── Two issue classes ─────────────────────────────────────────────────────────
 *
 *   "pending_stuck"   — PENDING messages older than MESSAGE_WATCHDOG_PENDING_MINUTES
 *                       (default: 60 min). Indicates a crashed or timed-out send
 *                       process. Sentry "warning" per message.
 *
 *   "failed_eligible" — FAILED messages with attempts < MESSAGE_WATCHDOG_MAX_RETRIES
 *                       (default: 3). Waiting for Phase 2 retry logic.
 *                       Sentry "warning" summary (type/channel breakdown, no per-message PII).
 *
 *   "failed_exhausted"— FAILED messages with attempts ≥ MESSAGE_WATCHDOG_MAX_RETRIES.
 *                       Require manual intervention.
 *                       Sentry "error" per message.
 *
 * ── No-PII guarantee ──────────────────────────────────────────────────────────
 *   Sentry events and response bodies NEVER include: recipientEmail,
 *   recipientPhone, body, subject, failureReason, providerResponse.
 *   Safe fields: messageId, type (enum), channel (enum), userId, ageMinutes, attempts.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 *   GET  — Vercel cron handler (runs daily at 11:00 UTC per vercel.json).
 *          Auth: Authorization: Bearer <CRON_SECRET> (timing-safe comparison).
 *          Manual test:
 *            curl https://www.signdeal.co.il/api/cron/messaging/watchdog \
 *              -H "Authorization: Bearer <CRON_SECRET>"
 *
 *   POST — Manual admin trigger (session-cookie auth via requireAdmin()).
 *          Manual test:
 *            curl -X POST https://www.signdeal.co.il/api/cron/messaging/watchdog \
 *              -H "Cookie: next-auth.session-token=<admin-session>"
 *
 * ── Response codes ────────────────────────────────────────────────────────────
 *   200 — Scan complete (always, even when issues are found).
 *         Sentry alerts are fired for any issues regardless.
 *         Response body includes issues[] for the caller to log.
 *   500 — Unexpected error during the scan itself.
 *   401 — Unauthorized.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   CRON_SECRET                        — shared secret for cron route auth
 *   MESSAGE_WATCHDOG_PENDING_MINUTES   — minutes before PENDING is "stuck" (default: 60)
 *   MESSAGE_WATCHDOG_MAX_RETRIES       — attempts threshold for "exhausted" (default: 3)
 */

import { NextResponse }           from "next/server";
import { timingSafeEqual }        from "crypto";
import * as Sentry                from "@sentry/nextjs";
import { requireAdmin }           from "@/lib/require-admin";
import { runMessageWatchdog }     from "@/lib/messaging/watchdog";

// ── Shared processor ──────────────────────────────────────────────────────────

async function runWatchdog(triggeredBy: string): Promise<NextResponse> {
  console.log(
    `[/api/cron/messaging/watchdog] triggered by ${triggeredBy}` +
    ` at=${new Date().toISOString()}`,
  );

  try {
    const result = await runMessageWatchdog();

    console.log(
      `[/api/cron/messaging/watchdog] complete` +
      ` pendingStuck=${result.pendingStuckCount}` +
      ` failedEligible=${result.failedEligibleCount}` +
      ` failedExhausted=${result.failedExhaustedCount}` +
      ` totalIssues=${result.totalIssues}`,
    );

    // Always 200 — this is a monitoring endpoint.
    // Sentry alerts were already fired inside runMessageWatchdog().
    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    console.error("[/api/cron/messaging/watchdog] unexpected error:", err);
    Sentry.captureException(err, {
      tags:  { component: "message_watchdog_cron" },
      level: "fatal",
    });
    return NextResponse.json(
      { error: "Message watchdog failed — check server logs" },
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
      `[/api/cron/messaging/watchdog GET] UNAUTHORIZED` +
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
