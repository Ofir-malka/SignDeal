/**
 * POST /api/billing/grow/verify
 *
 * Re-runs the Grow Rail A verification/activation bridge for the authenticated user.
 * Idempotent — safe to poll. Returns { state } only (no secrets). The redirect from
 * Grow is never trusted; activation happens here via getPaymentProcessInfo.
 *
 * Excluded from the edge middleware (matcher skips /api/) — auth via requireUserId().
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/require-user";
import { verifyAndActivateGrowTokenSetup } from "@/lib/billing/providers/grow/activate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const result = await verifyAndActivateGrowTokenSetup({ userId: auth.userId });
  return NextResponse.json({ state: result.state });
}
