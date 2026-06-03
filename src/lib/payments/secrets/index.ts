/**
 * src/lib/payments/secrets/index.ts  — Layer 2, RAIL B (Client → Broker)
 *
 * The ONLY feature surface for Rail B secrets (broker Grow merchant credential).
 * Rail is pinned to the constant "B" (R5): this module cannot reach a Rail A
 * (GROW_SAAS_CHARGE_TOKEN) row — guarded three ways (no cross-rail accessor,
 * import-boundary lint, runtime R2/R4).
 *
 * ⚠ PHASE 1: foundation only. Not called by any payment runtime path; no Grow API
 * calls; does not change payment behavior.
 */

import { SecretPurpose } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { storeSecret, readSecret } from "@/lib/secrets/accessor";
import type { RevealableSecret } from "@/lib/secrets/revealable-secret";
import { SecretNotFoundError } from "@/lib/secrets/errors";

const RAIL = "B" as const;
const OWNER_TYPE = "GrowBrokerMerchant" as const;
const PURPOSE = SecretPurpose.GROW_BROKER_API_KEY;

export interface StoreBrokerGrowApiKeyArgs {
  /** GrowBrokerMerchant.id */
  ownerId: string;
  /** The broker's Grow merchant API key (plaintext). */
  plaintext: string;
  reason: string;
  expiresAt?: Date | null;
}

/**
 * Encrypt + store the broker's Grow API key and set
 * GrowBrokerMerchant.apiKeySecretRef — atomically, in one transaction.
 */
export async function storeBrokerGrowApiKey(
  args: StoreBrokerGrowApiKeyArgs,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const secretRef = await storeSecret(
      {
        purpose: PURPOSE,
        rail: RAIL,
        ownerType: OWNER_TYPE,
        ownerId: args.ownerId,
        plaintext: args.plaintext,
        reason: args.reason,
        expiresAt: args.expiresAt ?? null,
      },
      { tx },
    );
    await tx.growBrokerMerchant.update({
      where: { id: args.ownerId },
      data: { apiKeySecretRef: secretRef },
    });
    return secretRef;
  });
}

export interface BrokerGrowCredentials {
  growUserId: string | null;
  apiKey: RevealableSecret;
  isActive: boolean;
}

/** Load + decrypt the broker's Grow credentials. Returns the key as a RevealableSecret. */
export async function getBrokerGrowCredentials(args: {
  ownerId: string;
}): Promise<BrokerGrowCredentials> {
  const merchant = await prisma.growBrokerMerchant.findUnique({
    where: { id: args.ownerId },
    select: { growUserId: true, apiKeySecretRef: true, isActive: true },
  });
  if (!merchant) {
    throw new SecretNotFoundError("GrowBrokerMerchant not found", {
      ownerType: OWNER_TYPE,
      rail: RAIL,
    });
  }
  if (!merchant.apiKeySecretRef) {
    throw new SecretNotFoundError("merchant has no stored Grow API key", {
      ownerType: OWNER_TYPE,
      rail: RAIL,
    });
  }

  const apiKey = await readSecret({
    secretRef: merchant.apiKeySecretRef,
    purpose: PURPOSE,
    rail: RAIL,
    ownerType: OWNER_TYPE,
    ownerId: args.ownerId,
  });

  return { growUserId: merchant.growUserId, apiKey, isActive: merchant.isActive };
}
