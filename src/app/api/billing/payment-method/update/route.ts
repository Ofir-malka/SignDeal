/**
 * POST /api/billing/payment-method/update
 *
 * Creates a card-update checkout session for a healthy ACTIVE or TRIALING
 * subscriber who wants to change their payment method without any billing
 * disruption. This is different from the recovery flow:
 *
 *   Recovery  → PAST_DUE / billingFailures ≥ 1 → resets billingFailures, restores ACTIVE
 *   PMU       → ACTIVE / TRIALING, no failures  → updates card fields only, no state changes
 *
 * HYP runs the same J5 auth-only flow as trial activation, issuing a new HKId
 * and returning CCode=700. /billing/success detects purpose="payment_method_update"
 * and updates card fields without touching status, billingFailures, firstPaymentAt,
 * nextBillingAt, or the current billing period.
 *
 * Request body: (empty — plan and interval are read from the subscription row)
 *
 * Response (200): { checkoutUrl: string }
 * Response (400): PAST_DUE or INCOMPLETE (wrong flow) / non-billable plan
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

/** Statuses that are eligible for self-serve card update. */
const ELIGIBLE_STATUSES = new Set(["ACTIVE", "TRIALING"]);

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
  // PAST_DUE → use /api/billing/recover instead.
  // INCOMPLETE → complete onboarding first.
  // CANCELED / EXPIRED → not eligible for card update.
  if (!ELIGIBLE_STATUSES.has(subscription.status)) {
    if (subscription.status === "PAST_DUE") {
      return NextResponse.json(
        { error: "Account is past due. Use the recovery flow to restore access.", code: "USE_RECOVERY" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: `Subscription status "${subscription.status}" is not eligible for payment method update` },
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

  // ── Fetch user email ──────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { email: true, fullName: true, phone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Build redirect URLs ───────────────────────────────────────────────────
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Grow (Rail A) verifies the new card on its own card-update bridge page.
  const successUrl = `${base}/billing/grow/payment-method/success`;
  const errorUrl   = `${base}/billing/error`;
  const cancelUrl  = `${base}/settings/billing/payment-method`; // back to PMU page on cancel
  const userPhone  = (user.phone ?? "").replace(/\D/g, "");

  // ── Create checkout session via active billing provider ───────────────────
  let provider;
  try {
    provider = getBillingProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/billing/payment-method/update] getBillingProvider failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await provider.createCheckoutSession({
    userId,
    userEmail: user.email,
    userName:  user.fullName,
    userPhone: userPhone || null,
    purpose:   "payment_method_update",
    plan:      subscription.plan            as BillablePlan,
    interval:  subscription.billingInterval as BillingInterval,
    successUrl,
    errorUrl,
    cancelUrl,
  });

  if (!result.ok) {
    console.error("[api/billing/payment-method/update] provider error:", result.reason);
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // ── Create PENDING checkout record ────────────────────────────────────────
  // purpose="payment_method_update" is REQUIRED: it tells activateCheckout to
  // update card fields only, without touching status / billingFailures /
  // firstPaymentAt / nextBillingAt.  Without this record in the DB, activation
  // is impossible — the user would complete HYP card entry and get a cryptic
  // "verification failed" screen on return.  Fail hard here instead.
  //
  // Common failure cause: migration 20260517210000_billing_checkout_purpose not
  // yet deployed to production (purpose column missing from BillingCheckout table).
  if (result.order) {
    try {
      await prisma.billingCheckout.create({
        data: {
          userId,
          order:            result.order,
          plan:             subscription.plan            as BillablePlan,
          interval:         subscription.billingInterval as BillingInterval,
          status:           "PENDING",
          purpose:          "payment_method_update",
          growProcessId:    result.growProcessId ?? null,
          growProcessToken: result.growProcessToken ?? null,
          expiresAt:        new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });
    } catch (err) {
      const errName = err instanceof Error ? err.constructor.name : "Unknown";
      const errMsg  = err instanceof Error ? err.message         : String(err);
      console.error(
        `[api/billing/payment-method/update] BillingCheckout create FAILED` +
        ` — userId=${userId} order=${result.order} purpose=payment_method_update` +
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
    `[api/billing/payment-method/update] session created` +
    ` userId=${userId}` +
    ` plan=${subscription.plan}` +
    ` interval=${subscription.billingInterval}` +
    ` status=${subscription.status}`,
  );

  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
