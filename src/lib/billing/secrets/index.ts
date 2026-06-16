/**
 * src/lib/billing/secrets/index.ts  — Layer 2, RAIL A (Broker → SignDeal SaaS)
 *
 * The ONLY feature surface for Rail A secrets (SignDeal SaaS billing token).
 * Rail is pinned to the constant "A" (R5): this module cannot reach a Rail B
 * (GROW_BROKER_API_KEY) row — guarded three ways (no cross-rail accessor,
 * import-boundary lint, runtime R2/R4).
 *
 * ⚠ PHASE 1: foundation only. Not called by any billing runtime path (HYP stays
 * the active SaaS-billing provider); no Grow API calls; no behavior change.
 */

import { SecretPurpose } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { storeSecret, readSecret, findActiveSecretRef } from "@/lib/secrets/accessor";
import type { RevealableSecret } from "@/lib/secrets/revealable-secret";
import { SecretNotFoundError } from "@/lib/secrets/errors";

const RAIL = "A" as const;
const OWNER_TYPE = "Subscription" as const;
const PURPOSE = SecretPurpose.GROW_SAAS_CHARGE_TOKEN;

// ── Platform singleton: SignDeal's OWN Grow SaaS merchant API key (Rail A) ──────
const MERCHANT_PURPOSE = SecretPurpose.GROW_SAAS_MERCHANT_API_KEY;
const PLATFORM_OWNER_TYPE = "Platform" as const;
const PLATFORM_OWNER_ID = "grow_saas" as const;

export interface StoreGrowSaasTokenArgs {
  /** Subscription.id */
  subscriptionId: string;
  /** The SignDeal SaaS recurring-charge token (plaintext). */
  plaintext: string;
  reason: string;
  expiresAt?: Date | null;
}

/**
 * Encrypt + store the SaaS charge token and set
 * Subscription.growSaasChargeSecretRef — atomically, in one transaction.
 */
export async function storeGrowSaasToken(args: StoreGrowSaasTokenArgs): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const secretRef = await storeSecret(
      {
        purpose: PURPOSE,
        rail: RAIL,
        ownerType: OWNER_TYPE,
        ownerId: args.subscriptionId,
        plaintext: args.plaintext,
        reason: args.reason,
        expiresAt: args.expiresAt ?? null,
      },
      { tx },
    );
    await tx.subscription.update({
      where: { id: args.subscriptionId },
      data: { growSaasChargeSecretRef: secretRef },
    });
    return secretRef;
  });
}

export interface GrowSaasBillingCredentials {
  growSaasCustomerId: string | null;
  chargeToken: RevealableSecret;
}

/** Load + decrypt the SaaS charge token. Returns the token as a RevealableSecret. */
export async function getGrowSaasBillingCredentials(args: {
  subscriptionId: string;
}): Promise<GrowSaasBillingCredentials> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: args.subscriptionId },
    select: { growSaasCustomerId: true, growSaasChargeSecretRef: true },
  });
  if (!subscription) {
    throw new SecretNotFoundError("Subscription not found", {
      ownerType: OWNER_TYPE,
      rail: RAIL,
    });
  }
  if (!subscription.growSaasChargeSecretRef) {
    throw new SecretNotFoundError("subscription has no stored Grow SaaS token", {
      ownerType: OWNER_TYPE,
      rail: RAIL,
    });
  }

  const chargeToken = await readSecret({
    secretRef: subscription.growSaasChargeSecretRef,
    purpose: PURPOSE,
    rail: RAIL,
    ownerType: OWNER_TYPE,
    ownerId: args.subscriptionId,
  });

  return { growSaasCustomerId: subscription.growSaasCustomerId, chargeToken };
}

// ── SignDeal's OWN Grow SaaS merchant API key (platform singleton) ──────────────

export interface StoreGrowSaasMerchantApiKeyArgs {
  /** SignDeal's OWN Grow SaaS merchant API key (plaintext). */
  plaintext: string;
  reason: string;
  expiresAt?: Date | null;
}

/**
 * Encrypt + store SignDeal's OWN Grow SaaS merchant API key as the single active
 * platform secret (ownerType="Platform", ownerId="grow_saas"). The partial unique
 * index admits exactly one active row; a second store throws SecretConflictError
 * until the first is purged/rotated (use rotateSecret to rotate). No owner-row
 * update → no $transaction needed.
 */
export async function storeGrowSaasMerchantApiKey(
  args: StoreGrowSaasMerchantApiKeyArgs,
): Promise<string> {
  return storeSecret({
    purpose: MERCHANT_PURPOSE,
    rail: RAIL,
    ownerType: PLATFORM_OWNER_TYPE,
    ownerId: PLATFORM_OWNER_ID,
    plaintext: args.plaintext,
    reason: args.reason,
    expiresAt: args.expiresAt ?? null,
  });
}

/**
 * Load + decrypt SignDeal's OWN Grow SaaS merchant API key. Finds the single active
 * platform secret by owner-tuple (rotation-safe — no pinned secretRef) and returns a
 * RevealableSecret. `.reveal()` ONLY inside the Rail A charge adapter (*.http.ts).
 */
export async function getGrowSaasMerchantApiKey(): Promise<RevealableSecret> {
  const secretRef = await findActiveSecretRef({
    purpose: MERCHANT_PURPOSE,
    rail: RAIL,
    ownerType: PLATFORM_OWNER_TYPE,
    ownerId: PLATFORM_OWNER_ID,
  });
  if (!secretRef) {
    throw new SecretNotFoundError("SignDeal Grow SaaS merchant API key not stored", {
      ownerType: PLATFORM_OWNER_TYPE,
      rail: RAIL,
    });
  }
  return readSecret({
    secretRef,
    purpose: MERCHANT_PURPOSE,
    rail: RAIL,
    ownerType: PLATFORM_OWNER_TYPE,
    ownerId: PLATFORM_OWNER_ID,
  });
}
