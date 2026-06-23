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

import { SecretPurpose, type Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { storeSecret, readSecret, findActiveSecretRef, rotateSecret } from "@/lib/secrets/accessor";
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
 * Accepts an optional caller transaction so it can compose inside a larger unit of work.
 */
export async function storeGrowSaasToken(
  args: StoreGrowSaasTokenArgs,
  opts?: { tx?: Prisma.TransactionClient },
): Promise<string> {
  const run = async (tx: Prisma.TransactionClient): Promise<string> => {
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
  };
  return opts?.tx ? run(opts.tx) : prisma.$transaction(run);
}

export interface RotateGrowSaasTokenArgs {
  /** Subscription.id */
  subscriptionId: string;
  /** The NEW SignDeal SaaS recurring-charge token (plaintext). */
  plaintext: string;
  reason: string;
}

/**
 * Rotate the SaaS charge token to a NEW value and re-point
 * Subscription.growSaasChargeSecretRef. For the card-update / recovery flow where an
 * active token already exists (so storeGrowSaasToken would throw SecretConflictError).
 *
 * Runs the lookup + rotate + owner-ref update as ONE transaction: the caller's when
 * `opts.tx` is supplied (so it composes atomically with the card-update claim/update),
 * otherwise its own — so even a standalone rotate can never split the secret rotation
 * from the owner-ref update. rotateSecret value-rotation purges the old row + inserts a
 * new one and returns the NEW ref; if no active token is on file yet, or the referenced
 * secret is missing, we fall back to a fresh storeGrowSaasToken seal (on the same txn).
 * NEVER logs the plaintext (audit is delegated to the Layer-1 accessor; `reason` is static).
 */
export async function rotateGrowSaasToken(
  args: RotateGrowSaasTokenArgs,
  opts?: { tx?: Prisma.TransactionClient },
): Promise<string> {
  const run = async (tx: Prisma.TransactionClient): Promise<string> => {
    const subscription = await tx.subscription.findUnique({
      where: { id: args.subscriptionId },
      select: { growSaasChargeSecretRef: true },
    });
    if (!subscription) {
      throw new SecretNotFoundError("Subscription not found", { ownerType: OWNER_TYPE, rail: RAIL });
    }

    // No active token yet → seal a fresh one (no rotate), on the same txn.
    if (!subscription.growSaasChargeSecretRef) {
      return storeGrowSaasToken(
        { subscriptionId: args.subscriptionId, plaintext: args.plaintext, reason: args.reason },
        { tx },
      );
    }

    let newRef: string;
    try {
      newRef = await rotateSecret(
        {
          secretRef: subscription.growSaasChargeSecretRef,
          purpose: PURPOSE,
          rail: RAIL,
          ownerType: OWNER_TYPE,
          ownerId: args.subscriptionId,
          newPlaintext: args.plaintext,
          reason: args.reason,
        },
        { tx },
      );
    } catch (err) {
      // Self-heal a dangling ref (referenced secret missing) by sealing a fresh token.
      if (err instanceof SecretNotFoundError) {
        return storeGrowSaasToken(
          { subscriptionId: args.subscriptionId, plaintext: args.plaintext, reason: args.reason },
          { tx },
        );
      }
      throw err;
    }

    await tx.subscription.update({
      where: { id: args.subscriptionId },
      data: { growSaasChargeSecretRef: newRef },
    });
    return newRef;
  };

  // Compose with the caller's txn when provided (no nested $transaction); else open our own.
  return opts?.tx ? run(opts.tx) : prisma.$transaction(run);
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
