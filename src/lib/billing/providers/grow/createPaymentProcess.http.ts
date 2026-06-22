/**
 * src/lib/billing/providers/grow/createPaymentProcess.http.ts — RAIL A token-only
 * checkout (Get Token Only). Reveals SignDeal's SaaS merchant apiKey (the `.http.ts`
 * ESLint allowance) and posts to createPaymentProcess. Server-side only. Returns a
 * discriminated result; NEVER throws or logs a secret.
 */

import { getGrowSaasMerchantApiKey } from "@/lib/billing/secrets";
import { buildTokenSetupFields } from "./request-builder";
import { parseTokenCheckoutResponse } from "./parse-response";
import {
  getGrowSaasCreatePaymentProcessUrl,
  getGrowSaasUserId,
  getGrowSaasPageCode,
} from "./config";
import type { GrowSaasTokenCheckoutArgs, GrowSaasTokenCheckoutResult } from "./types";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-SaaS-Billing/1.0";

export async function createGrowSaasTokenCheckout(
  args: GrowSaasTokenCheckoutArgs,
): Promise<GrowSaasTokenCheckoutResult> {
  let fields: Record<string, string>;
  try {
    const apiKey = (await getGrowSaasMerchantApiKey()).reveal(); // reveal ONLY here
    fields = buildTokenSetupFields({
      pageCode: getGrowSaasPageCode(),
      userId: getGrowSaasUserId(),
      apiKey,
      order: args.order,
      sumShekels: args.sumShekels,
      description: args.description,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      fullName: args.fullName,
      email: args.email,
      phone: args.phone ?? null,
      cField1: args.cField1,
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
    res = await fetch(getGrowSaasCreatePaymentProcessUrl(), {
      method: "POST",
      headers: { "User-Agent": USER_AGENT }, // do NOT set Content-Type — fetch adds the multipart boundary
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { ok: false, reason: `createPaymentProcess request failed (${reason})` };
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
  return parseTokenCheckoutResponse(json);
}
