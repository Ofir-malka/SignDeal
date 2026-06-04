/**
 * GET /api/grow/onboarding/status
 *
 * Returns the authenticated broker's current Grow onboarding / merchant state for
 * the settings UI. READ-ONLY over existing tables (no migration). Owner-scoped:
 * every query is keyed by the caller's own userId.
 *
 * SAFETY: the response NEVER includes api_key, *SecretRef, encrypted_lead, the
 * callback token, the session `reference`, or the FULL growUserId / trackingCode /
 * businessNumber. A few sensitive columns are loaded ONLY to derive safe summaries
 * (growUserId → last4, trackingCode → boolean, businessNumber → "***1234") and are
 * never placed in the response body.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { GrowOnboardingStatus } from "@/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GrowUiState =
  | "NOT_CONNECTED"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "CONNECTED"
  | "FAILED"
  | "EXPIRED";

function deriveState(
  isConnected: boolean,
  sessionStatus: GrowOnboardingStatus | null,
): GrowUiState {
  if (isConnected) return "CONNECTED";
  if (!sessionStatus) return "NOT_CONNECTED";
  switch (sessionStatus) {
    case GrowOnboardingStatus.FAILED:
      return "FAILED";
    case GrowOnboardingStatus.EXPIRED:
      return "EXPIRED";
    case GrowOnboardingStatus.PENDING_VERIFICATION:
    case GrowOnboardingStatus.COMPLETED: // completed but merchant not yet active
      return "PENDING_VERIFICATION";
    case GrowOnboardingStatus.LINK_ISSUED:
    case GrowOnboardingStatus.PENDING:
    default:
      return "IN_PROGRESS";
  }
}

export async function GET() {
  try {
    const auth = await requireUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const merchant = await prisma.growBrokerMerchant.findUnique({
      where: { userId },
      // growUserId + trackingCode are loaded ONLY to derive last4 / a boolean.
      // Their full values are NEVER returned. apiKeySecretRef is NOT selected.
      select: {
        isActive: true,
        packageId: true,
        trackingStatus: true,
        growUserId: true,
        trackingCode: true,
        updatedAt: true,
      },
    });

    const session = await prisma.growOnboardingSession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      // businessNumber + expectedTrackingCode are loaded ONLY to derive a preview /
      // boolean. leadSecretRef and reference are NOT selected.
      select: {
        id: true,
        status: true,
        statusReason: true,
        businessNumber: true,
        expectedTrackingCode: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    const isConnected = merchant?.isActive === true;
    const state = deriveState(isConnected, session?.status ?? null);

    return NextResponse.json({
      state,
      isConnected,
      merchant: merchant
        ? {
            packageId: merchant.packageId,
            trackingStatusId: merchant.trackingStatus,
            growUserIdLast4: merchant.growUserId ? merchant.growUserId.slice(-4) : null,
            updatedAt: merchant.updatedAt.toISOString(),
          }
        : null,
      session: session
        ? {
            id: session.id,
            status: session.status,
            statusReason: session.statusReason,
            businessNumberPreview: session.businessNumber
              ? `***${session.businessNumber.slice(-4)}`
              : null,
            // presence only — derived from either tracking source; value never returned
            hasTrackingCode: Boolean(
              session.expectedTrackingCode || merchant?.trackingCode,
            ),
            createdAt: session.createdAt.toISOString(),
            resolvedAt: session.resolvedAt ? session.resolvedAt.toISOString() : null,
          }
        : null,
    });
  } catch (err) {
    console.error("[GET /api/grow/onboarding/status]", err);
    return NextResponse.json({ error: "Failed to load Grow status" }, { status: 500 });
  }
}
