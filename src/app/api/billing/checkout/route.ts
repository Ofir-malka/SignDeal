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

  // ── Fetch user email (needed for provider customer creation) ──────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // ── Build redirect URLs ───────────────────────────────────────────────────
  const base       = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const successUrl = `${base}/billing/success`;
  const errorUrl   = `${base}/billing/error`;
  const cancelUrl  = `${base}/pricing`;

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

  return NextResponse.json({ checkoutUrl: result.checkoutUrl });
}
