/**
 * src/lib/secrets/purpose-map.ts
 *
 * The canonical Purpose ↔ Rail ↔ ownerType map — the single source of truth for
 * accessor validation rules R1–R3. (R4 is checked against the stored row inside
 * the accessor; R5 is enforced by Layer 2 pinning a rail constant; R6/R7 live in
 * the accessor.)
 *
 *   R1  purpose must be a known enum
 *   R2  the `rail` argument must equal the purpose's canonical rail
 *   R3  the `ownerType` must equal the purpose's canonical ownerType
 */

import { SecretPurpose } from "@/generated/prisma";
import {
  SecretValidationError,
  SecretRailMismatchError,
} from "./errors";

export type Rail = "A" | "B";

export interface PurposeSpec {
  rail: Rail;
  ownerType: string;
  /** Documentation only — informs sweeper/expiry policy, not enforced here. */
  ttlPolicy: "none" | "short";
}

/**
 * Canonical map. Mirrors the approved spec table exactly.
 *
 * | Purpose                  | Rail | ownerType             | TTL    |
 * | GROW_BROKER_API_KEY      | B    | GrowBrokerMerchant    | none   |
 * | GROW_ONBOARDING_LEAD     | B    | GrowOnboardingSession | short  |
 * | PAYER_BANK_ACCOUNT       | B    | Payment               | short  |
 * | GROW_SAAS_CHARGE_TOKEN   | A    | Subscription          | none   |
 */
export const SECRET_PURPOSE_MAP: Record<SecretPurpose, PurposeSpec> = {
  [SecretPurpose.GROW_BROKER_API_KEY]: {
    rail: "B",
    ownerType: "GrowBrokerMerchant",
    ttlPolicy: "none",
  },
  [SecretPurpose.GROW_ONBOARDING_LEAD]: {
    rail: "B",
    ownerType: "GrowOnboardingSession",
    ttlPolicy: "short",
  },
  [SecretPurpose.PAYER_BANK_ACCOUNT]: {
    rail: "B",
    ownerType: "Payment",
    ttlPolicy: "short",
  },
  [SecretPurpose.GROW_SAAS_CHARGE_TOKEN]: {
    rail: "A",
    ownerType: "Subscription",
    ttlPolicy: "none",
  },
};

/** R1: is this a known purpose? */
export function isKnownPurpose(purpose: string): purpose is SecretPurpose {
  return Object.prototype.hasOwnProperty.call(SECRET_PURPOSE_MAP, purpose);
}

/** Look up the canonical spec, throwing R1 if unknown. */
export function specForPurpose(purpose: string): PurposeSpec {
  if (!isKnownPurpose(purpose)) {
    throw new SecretValidationError("Unknown secret purpose", { purpose });
  }
  return SECRET_PURPOSE_MAP[purpose];
}

/**
 * R1 + R2 + R3: validate that (purpose, rail, ownerType) are mutually consistent
 * with the canonical map. Fail-closed. Returns the resolved spec on success.
 */
export function assertPurposeRailOwner(args: {
  purpose: string;
  rail: string;
  ownerType: string;
}): PurposeSpec {
  const spec = specForPurpose(args.purpose); // R1

  if (args.rail !== spec.rail) {
    throw new SecretRailMismatchError(
      "rail argument does not match the purpose's canonical rail",
      { purpose: args.purpose, rail: args.rail, ownerType: args.ownerType },
    );
  }

  if (args.ownerType !== spec.ownerType) {
    throw new SecretValidationError(
      "ownerType does not match the purpose's canonical ownerType",
      { purpose: args.purpose, rail: args.rail, ownerType: args.ownerType },
    );
  }

  return spec;
}
