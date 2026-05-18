/**
 * GET /api/stripe/connect/status
 *
 * Fetches the latest state of the broker's Stripe Connected Account from Stripe,
 * syncs the result to the BrokerStripeAccount DB row, and returns the updated row.
 *
 * Called by:
 *   • The onboarding return page (server component) after Stripe redirects back.
 *   • Optionally by UI to poll for status updates.
 *
 * ── Response (200) ────────────────────────────────────────────────────────────
 *   {
 *     onboardingStatus: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "RESTRICTED"
 *     chargesEnabled:   boolean
 *     payoutsEnabled:   boolean
 *     detailsSubmitted: boolean
 *   }
 *
 * ── Error responses ───────────────────────────────────────────────────────────
 *   401  — unauthenticated
 *   404  — no BrokerStripeAccount for this user (onboarding not started)
 *   500  — Stripe not configured or API error
 */

import { NextResponse }             from "next/server";
import { requireUserId }            from "@/lib/require-user";
import { getStripeClient, syncBrokerStripeAccount } from "@/lib/stripe";

export async function GET(): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // ── Ensure Stripe is configured ───────────────────────────────────────────
  try {
    getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/stripe/connect/status] getStripeClient failed:", msg);
    return NextResponse.json(
      { error: "מערכת התשלומים אינה מוגדרת. פנה לתמיכה." },
      { status: 500 },
    );
  }

  // ── Sync account state from Stripe ────────────────────────────────────────
  let result;
  try {
    result = await syncBrokerStripeAccount(userId, "userId");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/stripe/connect/status] sync failed userId=${userId}: ${msg}`,
    );
    return NextResponse.json(
      { error: "שגיאה בקבלת סטטוס מ-Stripe. נסה שנית." },
      { status: 500 },
    );
  }

  if (!result) {
    return NextResponse.json(
      { error: "לא נמצא חשבון Stripe. התחל הרשמה תחילה." },
      { status: 404 },
    );
  }

  console.log(
    `[api/stripe/connect/status] synced userId=${userId}` +
    ` status=${result.onboardingStatus}` +
    ` charges=${result.chargesEnabled}` +
    ` payouts=${result.payoutsEnabled}`,
  );

  return NextResponse.json(result);
}
