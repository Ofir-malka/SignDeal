/**
 * POST /api/billing/grow/payment-method/verify
 *
 * Re-runs the Grow Rail A card-update / recovery bridge for the authenticated user.
 * Idempotent (claim-gated) — safe to poll. Returns { state } only (no secrets). The
 * redirect from Grow is never trusted; the re-seal happens here via getPaymentProcessInfo.
 *
 * Excluded from the edge middleware (matcher skips /api/) — auth via requireUserId().
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";
import { verifyAndApplyGrowCardUpdate } from "@/lib/billing/providers/grow/card-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const result = await verifyAndApplyGrowCardUpdate({ userId: auth.userId });
  return NextResponse.json({ state: result.state });
}
