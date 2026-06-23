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
  /** Override the cField1 namespace (default `saas_token_setup:<order>`). */
  cField1?: string;
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

/**
 * Parsed body of a createTransactionWithToken response (SignDeal → Grow Rail A recurring charge).
 * Models the SERVER-TO-GROW CHARGE response ONLY — NOT a Grow → SignDeal webhook payload.
 */
export interface ParsedGrowChargeResponse {
  statusCode: string | null; // per-transaction status ("2" = charged/paid, "11" = saved-not-charged)
  status: string | null; // top-level request status ("1" = request accepted)
  errId: number | null; // top-level err.id (request/config error, e.g. 54 / 1013)
  transactionId: string | null; // Grow transaction id (non-secret, safe to store)
  approvalCode: string | null; // asmachta / approval code (non-secret, safe to store)
}

/**
 * Result of the SignDeal → Grow createTransactionWithToken HTTP call (Rail A recurring charge).
 * Request/response contract for SERVER-INITIATED charges — NOT a Grow → SignDeal webhook payload.
 * The `ok` variant carries the parsed body; the other variants are transport-level failures
 * surfaced by the HTTP layer (added in a later step). Consumed by classifyGrowCharge().
 */
export type GrowChargeHttpResult =
  | ({ transport: "ok" } & ParsedGrowChargeResponse)
  | { transport: "token_missing"; reason: string }
  | { transport: "network_error"; reason: string };
