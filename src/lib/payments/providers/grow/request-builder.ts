/**
 * src/lib/payments/providers/grow/request-builder.ts — PURE builders.
 *
 * No I/O, no logging, no .reveal(). The broker apiKey arrives as a plain string
 * (revealed by createPaymentProcess.http.ts) and is placed into the form map only.
 */

import type { BuildCreatePaymentProcessArgs, BuildCreatePaymentLinkArgs } from "./types";

/** Convert agorot (integer) to Grow's `sum` string in shekels with 2 decimals. */
export function agorotToShekels(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

/**
 * Build the createPaymentProcess form field map (sent as multipart/form-data).
 *
 *  - cField1 = paymentId is the webhook CORRELATION handle (Step 2).
 *  - transactionUniqueIdentifier (when provided) is a DUPLICATE-CHARGE guard —
 *    a different purpose, and only included when explicitly passed in.
 */
export function buildCreatePaymentProcessFields(
  args: BuildCreatePaymentProcessArgs,
): Record<string, string> {
  const fields: Record<string, string> = {
    pageCode: args.pageCode,
    userId: args.userId,
    // ⚠ apiKey placement = body (FormData), broker key — Grow-confirmation pending.
    //   The createPaymentProcess parameter table omits apiKey; authentication +
    //   approveTransaction show it as a multi-business body field. Isolated here so
    //   a body↔header / broker↔platform change is a one-line edit.
    apiKey: args.apiKey,
    sum: args.sumShekels,
    description: args.description,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    "pageField[fullName]": args.fullName,
    "pageField[phone]": args.phone,
    cField1: args.paymentId,
  };

  if (args.email && args.email.trim()) fields["pageField[email]"] = args.email.trim();
  if (args.companyCommission && args.companyCommission.trim()) {
    fields.companyCommission = args.companyCommission.trim();
  }
  if (args.notifyUrl && args.notifyUrl.trim()) fields.notifyUrl = args.notifyUrl.trim();

  // Grow-confirmation pending — duplicate-charge guard (token-txn-only in docs).
  if (args.transactionUniqueIdentifier && args.transactionUniqueIdentifier.trim()) {
    fields.transactionUniqueIdentifier = args.transactionUniqueIdentifier.trim();
  }

  return fields;
}

// ── CreatePaymentLink builder (Rail B managed link) — Step 1b ─────────────────
// Pure. The broker apiKey is a BODY field here; the product `x-api-key` is an HTTP
// HEADER set in createPaymentLink.http.ts and NEVER appears in this map. notifyUrl
// is P3-ready: included ONLY when provided (omitted in Step 1b while P3 is paused).

/**
 * transactionType set validated in sandbox to render Credit card / Bit / Apple Pay /
 * Google Pay / bank transfer / PayBox (wallets are device/browser-gated at display).
 * Exact code↔method labels: confirm against Grow's transactionType reference.
 */
const PAYMENT_LINK_TRANSACTION_TYPES = ["1", "6", "13", "14", "15", "5"] as const;
const PAYMENT_LINK_MAX_PAYMENTS = "12"; // installments allowed — not a fixed single payment
const PAYMENT_LINK_BG_COLOR = "#4F35F5";
const PAYMENT_LINK_BTN_COLOR = "#4F35F5";
const PAYMENT_LINK_BTN_TEXT = "לתשלום";

export function buildCreatePaymentLinkFields(
  args: BuildCreatePaymentLinkArgs,
): Record<string, string> {
  const fields: Record<string, string> = {
    userId: args.userId,
    apiKey: args.apiKey, // BODY field — the broker's account key (header key is separate)
    pageCode: args.pageCode,
    paymentLinkType: "2",
    isActive: "1",
    chargeType: "1",
    title: args.title,
    "paymentTypes[0][type]": "payments",
    // Allow up to N installments rather than a fixed single payment.
    "paymentTypes[0][payments][paymentsMaxPaymentNum]": PAYMENT_LINK_MAX_PAYMENTS,
    "pageFieldSettings[fullName][value]": args.fullName,
    "pageFieldSettings[phone][value]": args.phone,
    "products[data][0][name]": args.productName,
    // Commission only — no VAT/fees added on top of the client amount.
    "products[data][0][price]": args.sumShekels,
    "products[data][0][vatType]": "1",
    backgroundColor: PAYMENT_LINK_BG_COLOR,
    buttonColor: PAYMENT_LINK_BTN_COLOR,
    paymentButtonText: PAYMENT_LINK_BTN_TEXT,
  };

  PAYMENT_LINK_TRANSACTION_TYPES.forEach((t, i) => {
    fields[`transactionType[${i}]`] = t;
  });

  if (args.email && args.email.trim()) {
    fields["pageFieldSettings[email][value]"] = args.email.trim();
  }

  // P3-ready: include the server-to-server callback target only when provided.
  if (args.notifyUrl && args.notifyUrl.trim()) {
    fields.notifyUrl = args.notifyUrl.trim();
  }

  return fields;
}
