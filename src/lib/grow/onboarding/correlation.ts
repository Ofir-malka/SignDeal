/**
 * src/lib/grow/onboarding/correlation.ts
 *
 * Correlate an inbound callback to the GrowOnboardingSession that launched it,
 * and compute the idempotency dedup key.
 *
 * The callback URL is fixed/env-level (Grow stores one URL), so it carries NO
 * per-session identity — correlation is PAYLOAD-ONLY:
 *   1. tracking_code  → session.expectedTrackingCode   (primary, when present)
 *   2. phone + businessNumber                            (fallback)
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { GrowOnboardingStatus } from "@/generated/prisma";
import type { CanonicalOnboardingUpdate } from "./types";

/**
 * Deterministic idempotency key for a callback delivery. Same logical callback
 * → same key (so retries + the email channel collapse). Built ONLY from stable
 * identity fields — NEVER from api_key (rule 9).
 */
export function buildDedupKey(update: CanonicalOnboardingUpdate): string {
  const basis = [
    update.trackingCode ?? "",
    update.growUserId ?? "",
    update.trackingStatus?.id ?? "",
    update.statusRaw ?? "",
    update.businessTitle ?? "",
  ].join("|");
  return createHash("sha256").update(`grow-onboarding:${basis}`).digest("hex");
}

/** Sessions that may still receive a callback (non-terminal), most-recent first. */
const NON_TERMINAL: GrowOnboardingStatus[] = [
  GrowOnboardingStatus.PENDING,
  GrowOnboardingStatus.LINK_ISSUED,
  GrowOnboardingStatus.PENDING_VERIFICATION,
];

export interface CorrelatedSession {
  id: string;
  userId: string;
  status: GrowOnboardingStatus;
}

/**
 * Find the session this callback belongs to, or null. Tries tracking_code first,
 * then phone + business number among non-terminal sessions.
 */
export async function findSessionForUpdate(
  update: CanonicalOnboardingUpdate,
): Promise<CorrelatedSession | null> {
  const select = { id: true, userId: true, status: true } as const;

  if (update.trackingCode) {
    const byTracking = await prisma.growOnboardingSession.findFirst({
      where: { expectedTrackingCode: update.trackingCode },
      orderBy: { createdAt: "desc" },
      select,
    });
    if (byTracking) return byTracking;
  }

  // Fallback: phone among non-terminal sessions. The callback's `phone` must
  // equal the form phone per the onboarding docs, so it is a reliable key.
  if (update.phone) {
    const byPhone = await prisma.growOnboardingSession.findFirst({
      where: {
        phone: update.phone,
        status: { in: NON_TERMINAL },
      },
      orderBy: { createdAt: "desc" },
      select,
    });
    if (byPhone) return byPhone;
  }

  return null;
}
