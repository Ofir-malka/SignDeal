/**
 * src/lib/payments/providers/grow/createPaymentProcess.http.ts
 *
 * RAIL B (Client → Broker). The ONLY Grow-payment file permitted to reveal the
 * broker apiKey (the `.http.ts` suffix is the ESLint allowance). Server-side only
 * — Grow blocks client-side createPaymentProcess calls. Returns a discriminated
 * result and NEVER throws or logs a secret.
 *
 * Step 1: create-link only. No webhook, no paid-marking, no notifyUrl.
 */

import { getBrokerGrowCredentials } from "@/lib/payments/secrets";
import { buildCreatePaymentProcessFields, agorotToShekels } from "./request-builder";
import { parseCreatePaymentProcessResponse } from "./parse-response";
import {
  getCreatePaymentProcessUrl,
  getGrowPaymentPageCode,
  getGrowCompanyCommission,
  shouldSendTransactionUniqueIdentifier,
  buildSuccessUrl,
  buildCancelUrl,
  getPaymentNotifyUrl,
} from "./config";
import type { CreateGrowPaymentLinkArgs, GrowCreatePaymentResult } from "./types";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-Payments/1.0";

/** Create a Grow hosted payment URL for a client→broker (Rail B) payment. */
export async function createGrowPaymentLink(
  args: CreateGrowPaymentLinkArgs,
): Promise<GrowCreatePaymentResult> {
  let fields: Record<string, string>;
  try {
    const creds = await getBrokerGrowCredentials({ ownerId: args.merchantId });
    const growUserId = creds.growUserId ?? args.growUserId;
    if (!growUserId) return { ok: false, reason: "broker merchant has no growUserId" };

    fields = buildCreatePaymentProcessFields({
      pageCode: getGrowPaymentPageCode(),
      userId: growUserId,
      apiKey: creds.apiKey.reveal(), // reveal ONLY here
      sumShekels: agorotToShekels(args.grossAmountAgorot),
      description: args.description,
      successUrl: buildSuccessUrl(args.contractId),
      cancelUrl: buildCancelUrl(args.contractId),
      fullName: args.clientName,
      phone: args.clientPhone,
      email: args.clientEmail ?? null,
      paymentId: args.paymentId, // → cField1 (correlation)
      companyCommission: getGrowCompanyCommission(),
      notifyUrl: getPaymentNotifyUrl(), // null in Step 1
      transactionUniqueIdentifier: shouldSendTransactionUniqueIdentifier() ? args.paymentId : null,
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "config/credentials error" };
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(getCreatePaymentProcessUrl(), {
      method: "POST",
      headers: { "User-Agent": USER_AGENT }, // do NOT set Content-Type — fetch adds the multipart boundary
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { ok: false, reason: `Grow createPaymentProcess request failed (${reason})` };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status !== 200) return { ok: false, reason: `createPaymentProcess HTTP ${res.status}` };

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return parseCreatePaymentProcessResponse(json);
}
