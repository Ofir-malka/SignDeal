/**
 * src/lib/grow/onboarding/provisioning.ts
 *
 * Apply a correlated callback to durable state. Designed to be IDEMPOTENT and
 * RETRY-SAFE (rule 8): every step can run again after a partial failure without
 * double-effect, so the adapter can return 5xx (→ Grow retries) until the whole
 * thing completes.
 *
 * Success path order (each step idempotent):
 *   1. upsert GrowBrokerMerchant (isActive STAYS false — never activated here)
 *   2. seal api_key into EncryptedSecret IFF not already sealed
 *   3. move the session to PENDING_VERIFICATION
 *
 * api_key is sealed via the Rail-B Layer-2 facade (never the Layer-1 accessor,
 * never logged, never stored in sanitizedPayload).
 */

import { prisma } from "@/lib/prisma";
import { GrowOnboardingStatus } from "@/generated/prisma";
import { storeBrokerGrowApiKey } from "@/lib/payments/secrets";
import { SecretConflictError } from "@/lib/secrets/errors";
import { canTransition } from "./state-machine";
import type { CanonicalOnboardingUpdate } from "./types";
import type { CorrelatedSession } from "./correlation";

interface ApplyArgs {
  session: CorrelatedSession;
  update: CanonicalOnboardingUpdate;
}

/**
 * SUCCESS path. Throws on any failure so the caller returns 5xx and Grow retries.
 * Never sets isActive=true (PENDING_VERIFICATION only).
 */
export async function provisionMerchantPending({ session, update }: ApplyArgs): Promise<void> {
  // 1. Upsert the merchant. On UPDATE we deliberately do NOT touch isActive, so a
  //    late duplicate callback can never downgrade a later manual activation, and
  //    a fresh create stays inactive (default false).
  const merchant = await prisma.growBrokerMerchant.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      growUserId: update.growUserId,
      businessTitle: update.businessTitle,
      trackingCode: update.trackingCode,
      packageId: update.packageId,
      packageName: update.packageName,
      trackingStatus: update.trackingStatus?.id ?? null,
      isActive: false,
    },
    update: {
      growUserId: update.growUserId,
      businessTitle: update.businessTitle,
      trackingCode: update.trackingCode,
      packageId: update.packageId,
      packageName: update.packageName,
      trackingStatus: update.trackingStatus?.id ?? null,
    },
    select: { id: true, apiKeySecretRef: true },
  });

  // 2. Seal api_key only if present and not already sealed (idempotent on retry).
  if (update.apiKey && !merchant.apiKeySecretRef) {
    try {
      await storeBrokerGrowApiKey({
        ownerId: merchant.id,
        plaintext: update.apiKey,
        reason: "grow_onboarding_callback",
      });
    } catch (err) {
      // A concurrent delivery may have sealed first; the single-active invariant
      // surfaces that as a conflict — treat as already-sealed and continue.
      if (!(err instanceof SecretConflictError)) throw err;
    }
  }

  // 3. Move the session to PENDING_VERIFICATION (guarded; self-transition is legal).
  const target = GrowOnboardingStatus.PENDING_VERIFICATION;
  await prisma.growOnboardingSession.update({
    where: { id: session.id },
    data: {
      status: canTransition(session.status, target) ? target : session.status,
      growUserId: update.growUserId,
      statusReason: update.trackingStatus?.message ?? null,
      attemptCount: { increment: 1 },
      resolvedAt: new Date(),
    },
  });
}

/**
 * NON-SUCCESS path (status != "1" or no user_id). Records the failure on the
 * session; no merchant provisioning, no api_key. Idempotent.
 */
export async function recordFailedOnboarding({ session, update }: ApplyArgs): Promise<void> {
  const target = GrowOnboardingStatus.FAILED;
  await prisma.growOnboardingSession.update({
    where: { id: session.id },
    data: {
      status: canTransition(session.status, target) ? target : session.status,
      statusReason: update.trackingStatus?.message ?? null,
      attemptCount: { increment: 1 },
      resolvedAt: new Date(),
    },
  });
}
