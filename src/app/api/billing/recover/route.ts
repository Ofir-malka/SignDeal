/**
 * POST /api/billing/recover
 *
 * Creates a recovery checkout session for users whose billing has failed.
 * Eligible when: subscription status = PAST_DUE OR billingFailures >= 1.
 *
 * Reuses the existing plan + interval — recovery does not change the plan.
 * SuccessUrl is /billing/success (portal GoodURL constraint means we cannot
 * redirect to a custom URL; HYP strips all query params if GoodURL ≠ SuccessUrl).
 *
 * Request body: (empty — plan and interval are read from the subscription row)
 *
 * Response (200): { checkoutUrl: string }
 * Response (400): not eligible / non-billable plan
 * Response (401): unauthenticated
 * Response (404): no subscription or user found
 * Response (500): provider error
 */

import { NextResponse }       from "next/server";
import { requireUserId }      from "@/lib/require-user";
import { prisma }             from "@/lib/prisma";
import { getBillingProvider } from "@/lib/billing";
import type { BillablePlan, BillingInterval } from "@/lib/billing";

const BILLABLE_PLANS: readonly BillablePlan[] = ["STANDARD", "GROWTH", "PRO"];

export async function POST(): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // ── Fetch existing subscription ───────────────────────────────────────────
  const subscription = await prisma.subscription.findUnique({
    where:  { userId },
    select: {
      plan:            true,
      billingInterval: true,
      status:          true,
      billingFailures: true,
    },
  });

  if (!subscription) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  // ── Eligibility check ─────────────────────────────────────────────────────
  // Allow recovery if PAST_DUE or has any billing failures (1+).
  const isEligible =
    subscription.status === "PAST_DUE" || subscription.billingFailures >= 1;

  if (!isEligible) {
    return NextResponse.json(
      { error: "Subscription is not eligible for recovery" },
      { status: 400 },
    );
  }

  // ── Validate plan is self-serve billable ──────────────────────────────────
  if (!BILLABLE_PLANS.includes(subscription.plan as BillablePlan)) {
    return NextResponse.json(
      { error: `Plan "${subscription.plan}" is not self-serve billable` },
      { status: 400 },
    );
  }

  // ── Fetch user email (needed for provider session creation) ───────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Build redirect URLs ───────────────────────────────────────────────────
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // CRITICAL: successUrl MUST match the GoodURL configured in the HYP portal
  // (/billing/success). HYP strips all query params if they differ.
  const successUrl = `${base}/billing/success`;
  const errorUrl   = `${base}/billing/error`;
  const cancelUrl  = `${base}/settings/billing/recover`; // back to recovery page on cancel

  // ── Create checkout session via active billing provider ───────────────────
  let provider;
  try {
    provider = getBillingProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/billing/recover] getBillingProvider failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await provider.createCheckoutSession({
    userId,
    userEmail: user.email,
    plan:      subscription.plan     as BillablePlan,
    interval:  subscription.billingInterval as BillingInterval,
    successUrl,
    errorUrl,
    cancelUrl,
  });

  if (!result.ok) {
    console.error("[api/billing/recover] provider error:", result.reason);
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // ── Create PENDING checkout record ────────────────────────────────────────
  // purpose="recovery" is REQUIRED: it tells activateCheckout to reset
  // billingFailures and set status ACTIVE, without overwriting firstPaymentAt.
  // Without this record in the DB, activation is impossible — the user would
  // complete HYP card entry and get a cryptic "verification failed" screen.
  // Fail hard here instead.
  //
  // Common failure cause: migration 20260517210000_billing_checkout_purpose not
  // yet deployed to production (purpose column missing from BillingCheckout table).
  if (result.order) {
    try {
      await prisma.billingCheckout.create({
        data: {
          userId,
          order:     result.order,
          plan:      subscription.plan            as BillablePlan,
          interval:  subscription.billingInterval as BillingInterval,
          status:    "PENDING",
          purpose:   "recovery",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });
    } catch (err) {
      const errName = err instanceof Error ? err.constructor.name : "Unknown";
      const errMsg  = err instanceof Error ? err.message         : String(err);
      console.error(
        `[api/billing/recover] BillingCheckout create FAILED` +
        ` — userId=${userId} order=${result.order} purpose=recovery` +
        ` errName=${errName} errMsg=${errMsg.slice(0, 500)}` +
        ` — verify migration 20260517210000_billing_checkout_purpose is deployed`,
      );
      // Return 500 — do NOT redirect to HYP. Without a checkout row,
      // activateCheckout will throw CHECKOUT_NOT_FOUND and the user's
      // card entry session is wasted.
      return NextResponse.json(
        { error: "שגיאת מסד נתונים. נסה שנית." },
        { status: 500 },
      );
    }
  }

  console.log(
    `[api/billing/recover] session created` +
    ` userId=${userId}` +
    ` plan=${subscription.plan}` +
    ` interval=${subscription.billingInterval}` +
    ` status=${subscription.status}` +
    ` billingFailures=${subscription.billingFailures}`,
  );

  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
