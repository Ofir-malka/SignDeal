/**
 * GET /api/monitoring/test
 *
 * Temporary Sentry connectivity test endpoint.
 * Fires a captureMessage() and confirms the SDK is wired up correctly in
 * every environment including production.
 *
 * ── Access control ────────────────────────────────────────────────────────────
 * Two valid ways to call this endpoint (tried in order):
 *
 *   1. Authenticated admin session — requireAdmin() does a live DB role check.
 *      Works in every environment without any query params.
 *
 *   2. ?secret=<CRON_SECRET> query param — works in ALL environments.
 *      The CRON_SECRET value is the protection; the environment is not.
 *      Comparison is timing-safe (constant-time) to resist timing attacks.
 *      The secret is never echoed in the response or in logs.
 *
 * If neither path succeeds the endpoint returns the 401/403 from requireAdmin().
 *
 * ── Safe debug fields in response ────────────────────────────────────────────
 * On success the response includes two boolean hints to aid diagnosis:
 *   hasCronSecret  — true when CRON_SECRET env var is set and non-empty
 *   receivedSecret — true when the caller sent a non-empty ?secret param
 * These are booleans only — the actual secret values are never exposed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   # As admin (any environment):
 *   curl "https://app.signdeal.co.il/api/monitoring/test" \
 *     -H "Cookie: authjs.session-token=<token>"
 *
 *   # With CRON_SECRET (any environment including production):
 *   curl "https://app.signdeal.co.il/api/monitoring/test?secret=<CRON_SECRET>"
 *
 * ── Removal ───────────────────────────────────────────────────────────────────
 * Delete this file once Sentry is confirmed working in production.
 * It has no side-effects on data, billing, or payment logic.
 */

import { NextResponse }    from "next/server";
import * as Sentry         from "@sentry/nextjs";
import { timingSafeEqual } from "crypto";
import { requireAdmin }    from "@/lib/require-admin";

export async function GET(request: Request): Promise<NextResponse> {
  const url            = new URL(request.url);
  const providedSecret = url.searchParams.get("secret") ?? "";
  const cronSecret     = process.env.CRON_SECRET?.trim() ?? "";

  // Precompute debug booleans — booleans only, never the actual values.
  const hasCronSecret  = cronSecret.length > 0;
  const receivedSecret = providedSecret.length > 0;

  // ── Path 1: authenticated admin session ───────────────────────────────────
  // requireAdmin() does a live DB role check — JWT role is never trusted.
  const adminResult = await requireAdmin();
  const isAdmin     = !(adminResult instanceof NextResponse);

  // ── Path 2: CRON_SECRET query param ──────────────────────────────────────
  // Works in all environments. The strength of CRON_SECRET is the protection.
  // timingSafeEqual requires equal-length buffers — the length pre-check is
  // safe because it only reveals the expected length, not its content.
  const secretValid =
    !isAdmin &&
    hasCronSecret &&
    receivedSecret &&
    providedSecret.length === cronSecret.length &&
    timingSafeEqual(Buffer.from(providedSecret), Buffer.from(cronSecret));

  // ── Reject if neither path passed ────────────────────────────────────────
  if (!isAdmin && !secretValid) {
    // Return the 401/403 from requireAdmin() — do not reveal which path failed.
    return adminResult;
  }

  // ── Fire the Sentry test event ────────────────────────────────────────────
  Sentry.captureMessage("Sentry production test from SignDeal", {
    level: "info",
    tags: {
      component:    "monitoring_test",
      environment:  process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown",
      triggered_by: isAdmin ? "admin_session" : "cron_secret",
    },
  });

  return NextResponse.json({
    ok:             true,
    sent:           true,
    // Safe debug booleans — help confirm env var + param presence without
    // exposing any secret values.
    hasCronSecret,
    receivedSecret,
  });
}
