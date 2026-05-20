/**
 * GET /api/monitoring/test
 *
 * Temporary Sentry connectivity test endpoint.
 * Fires a captureMessage() to confirm the SDK is wired up correctly.
 *
 * ── Access control ────────────────────────────────────────────────────────────
 * In non-production environments (NODE_ENV !== "production"): open — no secret
 * required (useful for local and staging Sentry checks without managing secrets).
 *
 * In production: requires ?secret=<CRON_SECRET> query param.
 * Comparison is timing-safe (constant-time) to resist timing attacks.
 * Wrong or missing secret → 403. The secret is never echoed in the response.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   # Non-production (no secret needed):
 *   curl "http://localhost:3000/api/monitoring/test"
 *
 *   # Production:
 *   curl "https://app.signdeal.co.il/api/monitoring/test?secret=<CRON_SECRET>"
 *
 * ── Removal ───────────────────────────────────────────────────────────────────
 * Delete this file once Sentry is confirmed working in production.
 * It has no side-effects on data, billing, or payment logic.
 */

import { NextResponse }    from "next/server";
import * as Sentry         from "@sentry/nextjs";
import { timingSafeEqual } from "crypto";

export async function GET(request: Request): Promise<NextResponse> {
  const isProduction = process.env.NODE_ENV === "production";

  // ── Production gate: require ?secret=CRON_SECRET ─────────────────────────
  // In non-production environments the check is skipped entirely.
  if (isProduction) {
    const url            = new URL(request.url);
    const providedSecret = url.searchParams.get("secret") ?? "";
    const cronSecret     = process.env.CRON_SECRET?.trim() ?? "";

    // timingSafeEqual requires equal-length buffers — length pre-check is safe
    // because it only reveals the expected length, not its content.
    const secretValid =
      cronSecret.length > 0 &&
      providedSecret.length === cronSecret.length &&
      timingSafeEqual(Buffer.from(providedSecret), Buffer.from(cronSecret));

    if (!secretValid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Fire Sentry event ─────────────────────────────────────────────────────
  Sentry.captureMessage("Manual monitoring test from production", "info");

  // Flush ensures the event is delivered before the serverless function
  // returns. Without this, the function may be frozen before the SDK has
  // sent the buffered event to Sentry's ingest endpoint.
  await Sentry.flush(2000);

  return NextResponse.json({ ok: true, sent: true });
}
