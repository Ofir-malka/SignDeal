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
