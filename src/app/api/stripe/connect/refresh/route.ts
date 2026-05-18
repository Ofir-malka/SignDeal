/**
 * POST /api/stripe/connect/refresh
 *
 * Re-generates an expired Stripe Account Link for a broker whose onboarding
 * link has timed out (~10 min expiry on Stripe-hosted links).
 *
 * Unlike /api/stripe/connect/onboard, this route:
 *   • Does NOT create a new Stripe account (must already exist).
 *   • Does NOT create a new BrokerStripeAccount row.
 *   • Only generates a fresh Account Link for the existing stripeAccountId.
 *
 * Stripe redirects to the refresh_url when:
 *   • The Account Link has expired.
 *   • The broker navigated away and came back with an invalid/stale link.
 *
 * ── Response (200) ────────────────────────────────────────────────────────────
 *   { url: string }   — fresh Stripe onboarding link; redirect broker immediately
 *
 * ── Error responses ───────────────────────────────────────────────────────────
 *   401  — unauthenticated
 *   404  — no BrokerStripeAccount found (onboarding never started)
 *   500  — Stripe not configured or API error
 */

import { NextResponse }    from "next/server";
import { requireUserId }   from "@/lib/require-user";
import { prisma }          from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export async function POST(): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // ── Stripe client ─────────────────────────────────────────────────────────
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/stripe/connect/refresh] getStripeClient failed:", msg);
    return NextResponse.json(
      { error: "מערכת התשלומים אינה מוגדרת. פנה לתמיכה." },
      { status: 500 },
    );
  }

  // ── Load existing account ─────────────────────────────────────────────────
  const brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where:  { userId },
    select: { stripeAccountId: true, onboardingStatus: true },
  });

  if (!brokerAccount) {
    return NextResponse.json(
      { error: "לא נמצא חשבון Stripe. התחל הרשמה מחדש." },
      { status: 404 },
    );
  }

  // ── Generate fresh Account Link ───────────────────────────────────────────
  const base       = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const returnUrl  = `${base}/settings/payments/onboarding/return`;
  const refreshUrl = `${base}/settings/payments/onboarding/refresh`;

  let accountLink;
  try {
    accountLink = await stripe.accountLinks.create({
      account:     brokerAccount.stripeAccountId,
      return_url:  returnUrl,
      refresh_url: refreshUrl,
      type:        "account_onboarding",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[api/stripe/connect/refresh] stripe.accountLinks.create failed` +
      ` userId=${userId} acctId=${brokerAccount.stripeAccountId}: ${msg}`,
    );
    return NextResponse.json(
      { error: "שגיאה ביצירת קישור הרשמה חדש. נסה שנית." },
      { status: 500 },
    );
  }

  console.log(
    `[api/stripe/connect/refresh] link refreshed` +
    ` userId=${userId} acctId=${brokerAccount.stripeAccountId}` +
    ` prevStatus=${brokerAccount.onboardingStatus}`,
  );

  return NextResponse.json({ url: accountLink.url });
}
