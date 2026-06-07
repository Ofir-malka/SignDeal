/**
 * src/lib/payments/providers/grow/request-builder.ts — PURE builders.
 *
 * No I/O, no logging, no .reveal(). The broker apiKey arrives as a plain string
 * (revealed by createPaymentProcess.http.ts) and is placed into the form map only.
 */

import type { BuildCreatePaymentProcessArgs } from "./types";

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
