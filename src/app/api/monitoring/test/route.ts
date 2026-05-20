/**
 * GET /api/monitoring/test
 *
 * Temporary Sentry connectivity test endpoint.
 * Fires a captureMessage() and confirms the SDK is wired up correctly.
 *
 * ── Access control ────────────────────────────────────────────────────────────
 * Two valid ways to call this endpoint:
 *
 *   1. Authenticated admin session (requireAdmin DB-verified role check).
 *      Use this from a logged-in browser session or with a valid session cookie.
 *
 *   2. Query param secret in non-production environments only:
 *      GET /api/monitoring/test?secret=<CRON_SECRET>
 *      This allows testing from curl/CI without a browser session.
 *      Blocked entirely in production (NODE_ENV=production) regardless of secret.
 *
 * Neither path exposes any secret value in the response body.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   # As admin (any environment):
 *   curl https://app.signdeal.co.il/api/monitoring/test \
 *     -H "Cookie: authjs.session-token=<token>"
 *
 *   # With secret (non-production only):
 *   curl "http://localhost:3000/api/monitoring/test?secret=<CRON_SECRET>"
 *
 * ── Removal ───────────────────────────────────────────────────────────────────
 * Delete this file once Sentry is confirmed working in production.
 * It has no side-effects on data, billing, or payment logic.
 */

import { NextResponse }  from "next/server";
import * as Sentry       from "@sentry/nextjs";
import { timingSafeEqual } from "crypto";
import { requireAdmin }  from "@/lib/require-admin";

export async function GET(request: Request): Promise<NextResponse> {
  // ── Path 1: authenticated admin session ───────────────────────────────────
  // requireAdmin() does a live DB role check — JWT role is never trusted.
  const adminResult = await requireAdmin();
  const isAdmin     = !(adminResult instanceof NextResponse);

  if (!isAdmin) {
    // ── Path 2: CRON_SECRET query param (non-production only) ──────────────
    // Blocked in production so a leaked secret cannot trigger test events.
    if (process.env.NODE_ENV === "production") {
      // Return the same 401 that requireAdmin() produced — do not reveal
      // that a secret-based path exists in production.
      return adminResult;
    }

    // Non-production: allow if ?secret matches CRON_SECRET (timing-safe).
    const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
    const provided   = new URL(request.url).searchParams.get("secret") ?? "";

    const secretValid =
      cronSecret.length > 0 &&
      provided.length === cronSecret.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(cronSecret));

    if (!secretValid) {
      // Fall through to the admin 401/403 that requireAdmin() already built.
      return adminResult;
    }
  }

  // ── Fire the test event ───────────────────────────────────────────────────
  Sentry.captureMessage("Sentry production test from SignDeal", {
    level: "info",
    tags:  {
      component:   "monitoring_test",
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown",
      triggered_by: isAdmin ? "admin_session" : "cron_secret_dev",
    },
  });

  return NextResponse.json({ ok: true, sent: true });
}
