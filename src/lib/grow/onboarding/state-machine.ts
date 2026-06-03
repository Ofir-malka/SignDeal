/**
 * src/lib/grow/onboarding/state-machine.ts
 *
 * GrowOnboardingSession status transitions. Pure + synchronous.
 *
 * Confirmed policy: a SUCCESSFUL callback moves the session to
 * PENDING_VERIFICATION (never COMPLETED / never auto-active). Activation is a
 * later, manual/flagged step. A non-success callback is terminal FAILED.
 */

import { GrowOnboardingStatus } from "@/generated/prisma";
import type { CanonicalOnboardingUpdate } from "./types";

/**
 * Did the merchant get created on Grow's side? Requires top-level status "1"
 * AND a user_id (the routing anchor). Without user_id we cannot provision, so
 * it is not a success regardless of status.
 */
export function isSuccessfulOnboarding(update: CanonicalOnboardingUpdate): boolean {
  return update.statusRaw === "1" && !!update.growUserId;
}

/** Target session status for an inbound callback. */
export function nextStatusOnCallback(update: CanonicalOnboardingUpdate): GrowOnboardingStatus {
  return isSuccessfulOnboarding(update)
    ? GrowOnboardingStatus.PENDING_VERIFICATION
    : GrowOnboardingStatus.FAILED;
}

const LEGAL: Readonly<Record<GrowOnboardingStatus, readonly GrowOnboardingStatus[]>> = {
  [GrowOnboardingStatus.PENDING]: [
    GrowOnboardingStatus.LINK_ISSUED,
    GrowOnboardingStatus.PENDING_VERIFICATION,
    GrowOnboardingStatus.FAILED,
    GrowOnboardingStatus.EXPIRED,
  ],
  [GrowOnboardingStatus.LINK_ISSUED]: [
    GrowOnboardingStatus.PENDING_VERIFICATION,
    GrowOnboardingStatus.FAILED,
    GrowOnboardingStatus.EXPIRED,
  ],
  [GrowOnboardingStatus.PENDING_VERIFICATION]: [
    GrowOnboardingStatus.COMPLETED,
    GrowOnboardingStatus.FAILED,
  ],
  [GrowOnboardingStatus.COMPLETED]: [],
  [GrowOnboardingStatus.FAILED]: [],
  [GrowOnboardingStatus.EXPIRED]: [],
};

/**
 * Legal transition? Self-transitions are allowed (idempotent re-delivery of the
 * same callback must not throw).
 */
export function canTransition(from: GrowOnboardingStatus, to: GrowOnboardingStatus): boolean {
  if (from === to) return true;
  return LEGAL[from]?.includes(to) ?? false;
}
