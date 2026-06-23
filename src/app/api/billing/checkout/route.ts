/**
 * POST /api/billing/checkout
 *
 * Creates a billing checkout session for an authenticated user and returns
 * the URL to redirect them to (HYP hosted page or stub test page).
 *
 * No DB writes here — subscription update is the webhook handler's job.
 * No card data passes through this route.
 *
 * Request body:
 *   { plan: "STANDARD" | "GROWTH" | "PRO", interval: "MONTHLY" | "YEARLY" }
 *
 * Response (200):
 *   { checkoutUrl: string }
 *
 * Response (400): invalid plan or interval
 * Response (401): unauthenticated
 * Response (500): provider error
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId }             from "@/lib/require-user";
import { prisma }                    from "@/lib/prisma";
import { getBillingProvider }        from "@/lib/billing";
import { normalizeGrowPhone, isValidGrowPhone } from "@/lib/billing/grow-phone";
import { requiresRecovery, USE_RECOVERY_CODE } from "@/lib/billing/onboarding-eligibility";
import type { BillablePlan, BillingInterval } from "@/lib/billing";

const VALID_PLANS:     readonly BillablePlan[]    = ["STANDARD", "GROWTH", "PRO"];
const VALID_INTERVALS: readonly BillingInterval[] = ["MONTHLY", "YEARLY"];

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan, interval } = body as { plan?: unknown; interval?: unknown };

  if (!plan || !VALID_PLANS.includes(plan as BillablePlan)) {
    return NextResponse.json(
      { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!interval || !VALID_INTERVALS.includes(interval as BillingInterval)) {
    return NextResponse.json(
      { error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(", ")}` },
      { status: 400 },
    );
  }

  const validPlan     = plan     as BillablePlan;
  const validInterval = interval as BillingInterval;

  // ── Existing PAST_DUE subscribers must RECOVER, not start a new onboarding/upgrade
  //    checkout. The onboarding bridge only activates INCOMPLETE→TRIALING, so a PAST_DUE
  //    user routed here would dead-end (and a stray purpose="checkout" session is created).
  //    Send them to the recovery flow instead — BEFORE any Grow call or BillingCheckout. ──
  const existing = await prisma.subscription.findUnique({
    where:  { userId },
    select: { status: true },
  });
  if (requiresRecovery(existing?.status)) {
    console.log(`[api/billing/checkout] PAST_DUE → recovery redirect userId=${userId}`);
    return NextResponse.json(
      { error: "Account is past due. Use the recovery flow to restore access.", code: USE_RECOVERY_CODE },
      { status: 400 },
    );
  }

  // ── Fetch user identity (email + name + phone for the provider's hosted page) ──
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { email: true, fullName: true, phone: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Build redirect URLs ───────────────────────────────────────────────────
  const base       = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Grow (Rail A) verifies the saved card on its own bridge page, not HYP's /billing/success.
  const providerName = (process.env.BILLING_PROVIDER ?? "stub").trim().toLowerCase();
  const successUrl = providerName === "grow" ? `${base}/billing/grow/success` : `${base}/billing/success`;
  const errorUrl   = `${base}/billing/error`;
  const cancelUrl  = `${base}/pricing`;

  // ── Grow's hosted page requires a valid name + phone. Fail fast with a clear
  //    400 BEFORE any Grow call when the broker's profile phone is missing/invalid. ──
  const userPhone = normalizeGrowPhone(user.phone);
  if (providerName === "grow" && !isValidGrowPhone(userPhone)) {
    return NextResponse.json(
      { error: "מספר טלפון חסר או אינו תקין בפרופיל. עדכן/י את פרטי הפרופיל ונסה/י שוב." },
      { status: 400 },
    );
  }

  // ── Create checkout session via active billing provider ───────────────────
  let provider;
  try {
    provider = getBillingProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/billing/checkout] getBillingProvider failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await provider.createCheckoutSession({
    userId,
    userEmail: user.email,
    userName:  user.fullName,
    userPhone: userPhone || null,
    plan:      validPlan,
    interval:  validInterval,
    successUrl,
    errorUrl,
    cancelUrl,
  });

  if (!result.ok) {
    console.error("[api/billing/checkout] provider error:", result.reason);
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  // ── Create PENDING checkout record ────────────────────────────────────────
  // Only HYP (and future real providers) return an order — stub omits it.
  // The record enables replay protection, idempotency, and carries plan+interval
  // into the success callback so the activation step knows what to activate.
  if (result.order) {
    try {
      await prisma.billingCheckout.create({
        data: {
          userId,
          order:            result.order,
          plan:             validPlan,
          interval:         validInterval,
          status:           "PENDING",
          growProcessId:    result.growProcessId ?? null,
          growProcessToken: result.growProcessToken ?? null,
          expiresAt:        new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });
    } catch (err) {
      // Log but do NOT block the redirect — user experience > audit record.
      // A missing checkout row means the success page falls back to a safe
      // "session not found" error rather than silently activating.
      console.error("[api/billing/checkout] failed to create BillingCheckout:", err);
    }
  }

  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
