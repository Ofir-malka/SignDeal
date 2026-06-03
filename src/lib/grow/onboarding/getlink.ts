/**
 * src/lib/grow/onboarding/getlink.ts
 *
 * Outbound GetLink client (onboarding PDF p.3 + Postman collection):
 *   POST https://devregisterapi.meshulam.co.il/GetLink   (sandbox)
 *   header:  x-api-key: <platform key>   (+ User-Agent, mandatory)
 *   body:    { marketer, business_number, phone, price_quote,
 *              is_direct_debit, website, is_send_sms }
 *   success: { status:1, err:"", data:{ url, encrypted_lead } }
 *   failure: { status:0, err:{ id, message }, data:"" }
 *
 * The callback URL is NOT sent here (Grow configures it on their side).
 */

import { growPostJson } from "../http-client";
import { getLinkUrl, getMarketerId, getPlatformApiKey, resolvePriceQuote } from "../config";
import { GrowApiError, GrowNetworkError } from "../errors";
import type { GetLinkResult, StartOnboardingInput } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function statusIsOne(v: unknown): boolean {
  return v === 1 || v === "1";
}

/** Launch a Grow onboarding lead. Throws GrowApiError on status:0, GrowNetworkError on transport. */
export async function requestGetLink(input: StartOnboardingInput): Promise<GetLinkResult> {
  const body = {
    marketer: getMarketerId(),
    business_number: input.businessNumber,
    phone: input.phone,
    price_quote: resolvePriceQuote(input.priceQuote),
    is_direct_debit: input.isDirectDebit ?? 1,
    website: input.website ?? "",
    is_send_sms: input.sendSms ? 1 : 0,
  };

  const { status, json } = await growPostJson(getLinkUrl(), body, {
    "x-api-key": getPlatformApiKey(),
  });

  if (status !== 200) {
    throw new GrowNetworkError(`GetLink returned HTTP ${status}`);
  }

  const root = asRecord(json);
  if (!root) throw new GrowNetworkError("GetLink returned a non-JSON / empty body");

  if (statusIsOne(root.status)) {
    const data = asRecord(root.data);
    const url = data ? asString(data.url) : null;
    if (!url) throw new GrowApiError(null, "GetLink success but no form url in response");
    return {
      formUrl: url,
      encryptedLead: data ? asString(data.encrypted_lead) : null,
      trackingCode: data ? asString(data.tracking_code) : null,
    };
  }

  // Logical failure envelope: err may be an object {id,message} or a string.
  const err = asRecord(root.err);
  if (err) {
    const idRaw = err.id;
    const id = typeof idRaw === "number" ? idRaw : Number.isFinite(Number(idRaw)) ? Number(idRaw) : null;
    throw new GrowApiError(id, asString(err.message));
  }
  throw new GrowApiError(null, asString(root.err));
}
