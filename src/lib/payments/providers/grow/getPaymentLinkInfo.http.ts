/**
 * src/lib/payments/providers/grow/getPaymentLinkInfo.http.ts — P3b verify-then-trust.
 *
 * Authoritative status re-fetch for a CreatePaymentLink payment. Queried with data
 * WE stored at link creation (paymentLinkProcessId + token), so it is independent
 * of the (untrusted) callback. MESHULAM host family — broker apiKey in the BODY,
 * NO x-api-key header. Reveals the broker key (the .http.ts allowance). Never
 * throws or logs a secret.
 */

import { getBrokerGrowCredentials } from "@/lib/payments/secrets";
import { parsePaymentLinkInfoResponse } from "./parse-response";
import { getGetPaymentLinkInfoUrl, getGrowPaymentLinkPageCode } from "./config";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-Payments/1.0";

export type GrowPaymentLinkInfoResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string; errId?: number | null };

export async function getGrowPaymentLinkInfo(args: {
  merchantId: string;
  growUserId: string;
  paymentLinkProcessId: string;
  paymentLinkProcessToken: string;
}): Promise<GrowPaymentLinkInfoResult> {
  let fields: Record<string, string>;
  try {
    const creds = await getBrokerGrowCredentials({ ownerId: args.merchantId });
    const growUserId = creds.growUserId ?? args.growUserId;
    if (!growUserId) return { ok: false, reason: "broker merchant has no growUserId" };
    fields = {
      userId: growUserId,
      apiKey: creds.apiKey.reveal(), // reveal ONLY here — BODY field; NO x-api-key header
      pageCode: getGrowPaymentLinkPageCode(),
      paymentLinkProcessId: args.paymentLinkProcessId,
      paymentLinkProcessToken: args.paymentLinkProcessToken,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "config/credentials error" };
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(getGetPaymentLinkInfoUrl(), {
      method: "POST",
      headers: { "User-Agent": USER_AGENT }, // do NOT set Content-Type; NO x-api-key
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { ok: false, reason: `getPaymentLinkInfo request failed (${reason})` };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status !== 200) return { ok: false, reason: `getPaymentLinkInfo HTTP ${res.status}` };

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return parsePaymentLinkInfoResponse(json);
}
