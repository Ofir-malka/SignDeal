/**
 * src/lib/payments/providers/grow/webhook-parse.ts — P3b PURE helpers.
 *
 *  • extractCallbackTrigger — pulls the few fields we need FROM THE (untrusted)
 *    callback, used ONLY to locate the Payment + dedupe. Not a source of truth.
 *  • findPaidTransaction   — navigates a getPaymentLinkInfo response (the
 *    AUTHORITATIVE source) to the PAID transaction. All PAID-decision data comes
 *    from here, never from the callback.
 *
 * No I/O, no logging, no secrets.
 */

import type { VerifiedGrowTransaction } from "./types";

/** Trigger fields from the form-urlencoded callback (flat bracket keys). */
export interface CallbackTrigger {
  cField1: string | null;
  paymentLinkProcessId: string | null;
  transactionId: string | null;
}

export function extractCallbackTrigger(form: Record<string, unknown>): CallbackTrigger {
  return {
    cField1: str(form["data[customFields][cField1]"]),
    paymentLinkProcessId: str(form["data[paymentLinkProcessId]"]),
    transactionId: str(form["data[transactionId]"]),
  };
}

/**
 * Find a PAID transaction (statusCode "2") inside a getPaymentLinkInfo `data`
 * object. When expectedCField1 is given, only an entry whose customField.cField1
 * matches it (or has none) is considered. Returns the authoritative fields or null.
 *
 * Shape (live-verified):
 *   data.paymentLinkProcessId
 *   data.paymentLinkTransactions[].processId / .processToken
 *   data.paymentLinkTransactions[].customField.cField1
 *   data.paymentLinkTransactions[].transactions[].{ statusCode, status, sum,
 *       transactionId, transactionToken, asmachta, cardSuffix, paymentLinkProcessId }
 */
export function findPaidTransaction(
  data: unknown,
  expectedCField1: string | null,
): VerifiedGrowTransaction | null {
  const root = asRec(data);
  if (!root) return null;
  const rootLinkId = str(root.paymentLinkProcessId);
  const entries = Array.isArray(root.paymentLinkTransactions) ? root.paymentLinkTransactions : [];

  for (const entryRaw of entries) {
    const entry = asRec(entryRaw);
    if (!entry) continue;
    const cf = asRec(entry.customField);
    const entryCField1 = cf ? str(cf.cField1) : null;
    // Skip entries that explicitly belong to a DIFFERENT cField1.
    if (expectedCField1 && entryCField1 && entryCField1 !== expectedCField1) continue;

    const txns = Array.isArray(entry.transactions) ? entry.transactions : [];
    for (const tRaw of txns) {
      const t = asRec(tRaw);
      if (!t) continue;
      const statusCode = str(t.statusCode);
      if (statusCode !== "2") continue; // only the known PAID code
      return {
        paid: true,
        statusCode,
        cField1: entryCField1,
        sumShekels: str(t.sum),
        paymentLinkProcessId: str(t.paymentLinkProcessId) ?? rootLinkId,
        transactionId: str(t.transactionId),
        transactionToken: str(t.transactionToken),
        asmachta: str(t.asmachta),
        cardSuffix: str(t.cardSuffix),
        processId: str(entry.processId),
        processToken: str(entry.processToken),
      };
    }
  }
  return null;
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
