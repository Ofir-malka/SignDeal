/**
 * src/lib/payments/providers/grow/approveTransaction.http.ts — P3b best-effort ACK.
 *
 * Per Grow docs the payment is processed whether or not ApproveTransaction is
 * called, so this NEVER throws and PAID NEVER depends on it. Gated behind
 * GROW_PAYMENT_LINK_APPROVE_ENABLED (default OFF) until the exact endpoint/params
 * are probe-confirmed — when off this is a no-op. MESHULAM host; broker apiKey in
 * the body (revealed here); no x-api-key header. Logs ids only, never a secret.
 */

import { getBrokerGrowCredentials } from "@/lib/payments/secrets";
import {
  getApproveTransactionUrl,
  getGrowPaymentLinkPageCode,
  isGrowApproveTransactionEnabled,
} from "./config";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-Payments/1.0";

export async function approveGrowTransaction(args: {
  merchantId: string;
  growUserId: string;
  processId: string | null;
  processToken: string | null;
  transactionId: string | null;
}): Promise<void> {
  if (!isGrowApproveTransactionEnabled()) return; // off until endpoint/params confirmed
  if (!args.processId || !args.processToken) return;

  try {
    const creds = await getBrokerGrowCredentials({ ownerId: args.merchantId });
    const growUserId = creds.growUserId ?? args.growUserId;
    if (!growUserId) return;

    const fields: Record<string, string> = {
      userId: growUserId,
      apiKey: creds.apiKey.reveal(),
      pageCode: getGrowPaymentLinkPageCode(),
      processId: args.processId,
      processToken: args.processToken,
    };
    if (args.transactionId) fields.transactionId = args.transactionId;

    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(getApproveTransactionUrl(), {
        method: "POST",
        headers: { "User-Agent": USER_AGENT },
        body: form,
        signal: controller.signal,
        cache: "no-store",
      });
      console.log(`[grow/approveTransaction] HTTP ${res.status} transactionId=${args.transactionId ?? "n/a"}`);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Best-effort: swallow. PAID stands regardless.
    console.error(
      "[grow/approveTransaction] best-effort failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
