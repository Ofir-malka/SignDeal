/**
 * GET /api/grow/onboarding/session/[id]
 *
 * Returns a broker's own onboarding session status FROM OUR DATABASE ONLY.
 * There is no Grow onboarding status API — status is learned only from the
 * inbound callback, so this never calls Grow.
 *
 * Owner-scoped: a session that isn't the caller's returns 404 (no existence leak).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { id } = await params;

    const session = await prisma.growOnboardingSession.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        statusReason: true,
        businessNumber: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    // Not found OR not the caller's → 404 (do not reveal another broker's session).
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Merchant activation is the separate verification gate (isActive stays false
    // until a later manual/flagged step). Surface it read-only.
    const merchant = await prisma.growBrokerMerchant.findUnique({
      where: { userId },
      select: { isActive: true },
    });

    return NextResponse.json({
      status: session.status,
      statusReason: session.statusReason,
      businessNumber: session.businessNumber,
      createdAt: session.createdAt,
      resolvedAt: session.resolvedAt,
      merchantActive: merchant?.isActive ?? false,
    });
  } catch (err) {
    console.error("[GET /api/grow/onboarding/session/[id]]", err);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
