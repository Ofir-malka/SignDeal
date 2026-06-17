/**
 * src/lib/billing/providers/grow/types.ts — Rail A Grow SaaS billing types.
 * No external imports (avoids cycles with @/lib/billing).
 */

/** Input to the token-only checkout HTTP call (Get Token Only). */
export interface GrowSaasTokenCheckoutArgs {
  /** BillingCheckout.order (also the cField1 correlation seed). */
  order: string;
  /** Shekels string, 2 decimals (display only — chargeType=3 does not charge). */
  sumShekels: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  fullName: string;
  email: string;
  phone?: string | null;
}

export type GrowSaasTokenCheckoutResult =
  | { ok: true; url: string; processId: string; processToken: string | null }
  | { ok: false; reason: string; errId?: number | null };

/** Saved-token info extracted from a getPaymentProcessInfo response. */
export interface GrowSaasSavedToken {
  statusCode: string | null; // "11" = card saved / token setup
  cardToken: string | null; // SENSITIVE — never logged
  cardSuffix: string | null; // last-4, safe to display
  cField1: string | null;
  processId: string | null;
}
