/**
 * src/lib/billing/providers/grow/getPaymentProcessInfo.http.ts — RAIL A verify-then-
 * trust. Authoritative re-fetch of a token-setup process, queried with the
 * processId/processToken WE stored at checkout (independent of the redirect). Reveals
 * the SaaS apiKey (the `.http.ts` allowance). NEVER throws or logs a secret.
 */

import { getGrowSaasMerchantApiKey } from "@/lib/billing/secrets";
import { buildProcessInfoFields } from "./request-builder";
import {
  getGrowSaasGetPaymentProcessInfoUrl,
  getGrowSaasUserId,
  getGrowSaasPageCode,
} from "./config";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-SaaS-Billing/1.0";

export type GrowSaasProcessInfoResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: string };

export async function getGrowSaasProcessInfo(args: {
  processId: string;
  processToken: string;
}): Promise<GrowSaasProcessInfoResult> {
  let fields: Record<string, string>;
  try {
    const apiKey = (await getGrowSaasMerchantApiKey()).reveal(); // reveal ONLY here
    fields = buildProcessInfoFields({
      pageCode: getGrowSaasPageCode(),
      userId: getGrowSaasUserId(),
      apiKey,
      processId: args.processId,
      processToken: args.processToken,
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
    res = await fetch(getGrowSaasGetPaymentProcessInfoUrl(), {
      method: "POST",
      headers: { "User-Agent": USER_AGENT },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { ok: false, reason: `getPaymentProcessInfo request failed (${reason})` };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status !== 200) return { ok: false, reason: `getPaymentProcessInfo HTTP ${res.status}` };

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const root = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!root) return { ok: false, reason: "non-JSON getPaymentProcessInfo response" };
  const inner = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  return { ok: true, data: inner };
}
