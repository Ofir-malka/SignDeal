/**
 * src/lib/payments/providers/grow/types.ts — RAIL B (Client → Broker) Grow payments.
 *
 * Pure types for the createPaymentProcess flow. No secrets are defined here; the
 * broker apiKey is passed as a plain string into the (pure) request builder and is
 * revealed ONLY inside createPaymentProcess.http.ts.
 */

export interface BuildCreatePaymentProcessArgs {
  /** Platform-level pageCode (per payment method) — same for every broker. */
  pageCode: string;
  /** The broker's Grow userId — WHO RECEIVES the money. */
  userId: string;
  /** Revealed broker apiKey — passed in by *.http.ts; NEVER logged. */
  apiKey: string;
  /** Charge amount already converted from agorot to a shekel string (2-dp). */
  sumShekels: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  fullName: string;
  phone: string;
  email?: string | null;
  /** Our Payment.id → sent as cField1 (webhook CORRELATION, Step 2). */
  paymentId: string;
  /** Fixed ILS, ex-VAT platform commission. Omitted from the request when null. */
  companyCommission?: string | null;
  /** Step 1: intentionally null (no webhook handler yet). */
  notifyUrl?: string | null;
  /**
   * Grow-confirmation pending — duplicate-charge guard. Documented for TOKEN
   * transactions only (changelog 01.11.2023), NOT for createPaymentProcess, so it
   * is sent ONLY when explicitly provided (flag-gated upstream). Distinct from
   * cField1 (correlation) and from transactionGroupIdentifier (which we never use).
   */
  transactionUniqueIdentifier?: string | null;
}

export interface CreateGrowPaymentLinkArgs {
  /** GrowBrokerMerchant.id — the EncryptedSecret owner for the broker apiKey. */
  merchantId: string;
  /** Broker's Grow userId (from the routing gate; double-checked against creds). */
  growUserId: string;
  contractId: string;
  /** Our Payment.id (→ cField1, and the transactionUniqueIdentifier candidate). */
  paymentId: string;
  grossAmountAgorot: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  description: string;
}

export type GrowCreatePaymentResult =
  | { ok: true; paymentUrl: string; processId: string; processToken: string | null }
  | { ok: false; reason: string; errId?: number | null };

/**
 * Input to the pure CreatePaymentLink builder (Step 1b — managed long-lived link).
 *
 * The broker apiKey is a BODY field here (the account credential); the product
 * `x-api-key` is an HTTP HEADER set in createPaymentLink.http.ts and NEVER appears
 * in this map. notifyUrl is P3-ready: included only when non-empty.
 */
export interface BuildCreatePaymentLinkArgs {
  /** Broker's Grow userId — WHO RECEIVES the money. */
  userId: string;
  /** Revealed broker apiKey — BODY field. NEVER logged. */
  apiKey: string;
  /** Link-compatible pageCode (GROW_PAYMENT_LINK_PAGECODE; sandbox 12796f74fc4f). */
  pageCode: string;
  /** Our Payment.id → sent as cField1 (P3a webhook CORRELATION handle). */
  paymentId: string;
  /** Client amount in shekels (commission only — agorot→shekels, no VAT/fees added). */
  sumShekels: string;
  /** Link title + product line name (e.g. "עמלת תיווך — …"). */
  title: string;
  productName: string;
  fullName: string;
  phone: string;
  email?: string | null;
  /**
   * Server-to-server callback target. Step 1b: null → field omitted. P3: set to the
   * flat https://www.signdeal.co.il/api/grow/webhook. Included only when non-empty.
   */
  notifyUrl?: string | null;
}

/**
 * A PAID transaction extracted from the getPaymentLinkInfo re-fetch — the
 * AUTHORITATIVE source for P3b's PAID decision. Token fields are persisted to the
 * Payment row / used for ApproveTransaction but are NEVER logged.
 */
export interface VerifiedGrowTransaction {
  paid: boolean;
  statusCode: string | null;
  cField1: string | null;
  sumShekels: string | null;
  paymentLinkProcessId: string | null;
  transactionId: string | null;
  transactionToken: string | null;
  asmachta: string | null;
  cardSuffix: string | null;
  processId: string | null;
  processToken: string | null;
}
