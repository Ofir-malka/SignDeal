/**
 * POST /api/stripe/connect/onboard
 *
 * Idempotent single-call onboarding endpoint.
 *
 * ── What it does ──────────────────────────────────────────────────────────────
 *   1. If no BrokerStripeAccount exists for this user:
 *        a. Creates a Stripe Express account (country=IL, transfers capability).
 *        b. Writes a BrokerStripeAccount row (status=PENDING).
 *   2. If account exists and status is COMPLETE → returns { alreadyComplete: true }.
 *   3. In all non-complete cases: generates a fresh Stripe Account Link
 *      (type="account_onboarding") and returns { url }.
 *
 * This is the only route the ConnectButton calls — one round-trip from the UI.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 * Calling this route multiple times for the same user is safe:
 *   • Step 1 is skipped if a BrokerStripeAccount row already exists.
 *   • Account Link generation always produces a fresh, short-lived URL.
 *   • No second Stripe account is ever created for the same userId.
 *
 * ── Response (200) ────────────────────────────────────────────────────────────
 *   { url: string }                 — redirect broker to this Stripe hosted URL
 *   { alreadyComplete: true }       — broker's account is fully active
 *
 * ── Error responses ───────────────────────────────────────────────────────────
 *   401  — unauthenticated
 *   500  — Stripe not configured, Stripe API error, or DB write failed
 *
 * ⚠ Do NOT use this for HYP billing. HYP routes are in /api/billing/.
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
    console.error("[api/stripe/connect/onboard] getStripeClient failed:", msg);
    return NextResponse.json(
      { error: "מערכת התשלומים אינה מוגדרת. פנה לתמיכה." },
      { status: 500 },
    );
  }

  // ── Check for existing BrokerStripeAccount ────────────────────────────────
  let brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where:  { userId },
    select: { stripeAccountId: true, onboardingStatus: true },
  });

  // Short-circuit: broker is already fully onboarded
  if (brokerAccount?.onboardingStatus === "COMPLETE") {
    console.log(`[api/stripe/connect/onboard] already complete userId=${userId}`);
    return NextResponse.json({ alreadyComplete: true });
  }

  // ── Create Stripe Express account if not yet present ─────────────────────
  if (!brokerAccount) {
    // Fetch user email to pre-fill Stripe's onboarding form
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    });

    let stripeAccount;
    try {
      stripeAccount = await stripe.accounts.create({
        type:    "express",
        country: "IL",
        email:   user?.email ?? undefined,

        // ── Israel / recipient-service-agreement requirement ──────────────────
        // Israeli connected accounts act as transfer recipients (the platform
        // collects payment from the client and transfers the broker's share).
        // They do NOT process card payments directly.
        //
        // Stripe requires:
        //   • Only `transfers` capability — NOT `card_payments`
        //   • `tos_acceptance.service_agreement = "recipient"` to accept the
        //     recipient service agreement instead of the full merchant agreement
        //
        // Without this, Stripe rejects the account creation with:
        //   "A recipient service agreement is required for accounts in IL."
        capabilities: {
          transfers: { requested: true },
        },
        tos_acceptance: {
          service_agreement: "recipient",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[api/stripe/connect/onboard] stripe.accounts.create failed userId=${userId}: ${msg}`,
      );
      return NextResponse.json(
        { error: "שגיאה ביצירת חשבון Stripe. נסה שנית." },
        { status: 500 },
      );
    }

    try {
      brokerAccount = await prisma.brokerStripeAccount.create({
        data: {
          userId,
          stripeAccountId:  stripeAccount.id,
          onboardingStatus: "PENDING",
        },
        select: { stripeAccountId: true, onboardingStatus: true },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[api/stripe/connect/onboard] BrokerStripeAccount.create failed` +
        ` userId=${userId} acctId=${stripeAccount.id}: ${msg}`,
      );
      // The Stripe account was created but we couldn't persist it.
      // Return 500 — broker can retry; we won't create a duplicate (row absent → retry creates new acct).
      // In production, alert on this log line and reconcile manually.
      return NextResponse.json(
        { error: "שגיאת מסד נתונים. פנה לתמיכה." },
        { status: 500 },
      );
    }

    console.log(
      `[api/stripe/connect/onboard] account created` +
      ` userId=${userId} acctId=${stripeAccount.id}`,
    );
  }

  // ── Generate Account Link (fresh short-lived URL) ─────────────────────────
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
      `[api/stripe/connect/onboard] stripe.accountLinks.create failed` +
      ` userId=${userId} acctId=${brokerAccount.stripeAccountId}: ${msg}`,
    );
    return NextResponse.json(
      { error: "שגיאה ביצירת קישור הרשמה. נסה שנית." },
      { status: 500 },
    );
  }

  console.log(
    `[api/stripe/connect/onboard] link generated` +
    ` userId=${userId} acctId=${brokerAccount.stripeAccountId}` +
    ` status=${brokerAccount.onboardingStatus}`,
  );

  return NextResponse.json({ url: accountLink.url });
}
