/**
 * src/lib/payments/providers/grow/createPaymentLink.http.ts
 *
 * RAIL B (Client → Broker) — Step 1b: Grow CreatePaymentLink (managed long-lived
 * link). Selected over createPaymentProcess by GROW_PAYMENT_LINK_ENABLED.
 *
 * TWO keys, two places (proven sandbox model):
 *   • HEADER  x-api-key = the product/integration key (GROW_PAYMENT_LINK_X_API_KEY)
 *   • BODY    apiKey    = the broker's account key (revealed here — the only file
 *                         permitted to .reveal(), per the .http.ts ESLint allowance)
 *
 * Server-side only. Returns the shared GrowCreatePaymentResult (so the route's
 * persist/SMS/email path is reused). NEVER throws or logs a secret.
 *
 * Step 1b: notifyUrl is omitted (P3 webhook paused). It becomes active simply by
 * setting GROW_PAYMENT_LINK_NOTIFY_URL — no code change needed here.
 */

import { getBrokerGrowCredentials } from "@/lib/payments/secrets";
import { buildCreatePaymentLinkFields, agorotToShekels } from "./request-builder";
import { parseCreatePaymentLinkResponse } from "./parse-response";
import {
  getCreatePaymentLinkUrl,
  getGrowPaymentLinkXApiKey,
  getGrowPaymentLinkPageCode,
  getGrowPaymentLinkNotifyUrl,
} from "./config";
import type { CreateGrowPaymentLinkArgs, GrowCreatePaymentResult } from "./types";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-Payments/1.0";

/** Create a Grow managed payment link (CreatePaymentLink) for a Rail B payment. */
export async function createManagedPaymentLink(
  args: CreateGrowPaymentLinkArgs,
): Promise<GrowCreatePaymentResult> {
  let fields: Record<string, string>;
  let xApiKey: string;
  try {
    const creds = await getBrokerGrowCredentials({ ownerId: args.merchantId });
    const growUserId = creds.growUserId ?? args.growUserId;
    if (!growUserId) return { ok: false, reason: "broker merchant has no growUserId" };

    xApiKey = getGrowPaymentLinkXApiKey(); // product key — HTTP header (throws if unset)

    fields = buildCreatePaymentLinkFields({
      userId: growUserId,
      apiKey: creds.apiKey.reveal(), // broker key — BODY field; reveal ONLY here
      pageCode: getGrowPaymentLinkPageCode(),
      sumShekels: agorotToShekels(args.grossAmountAgorot), // commission only (P0)
      title: args.description,
      productName: args.description,
      fullName: args.clientName,
      phone: args.clientPhone,
      email: args.clientEmail ?? null,
      notifyUrl: getGrowPaymentLinkNotifyUrl(), // null in Step 1b; P3 sets the flat URL
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
    res = await fetch(getCreatePaymentLinkUrl(), {
      method: "POST",
      // product key in the header; do NOT set Content-Type — fetch adds the multipart boundary
      headers: { "User-Agent": USER_AGENT, "x-api-key": xApiKey },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { ok: false, reason: `Grow CreatePaymentLink request failed (${reason})` };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status !== 200) return { ok: false, reason: `CreatePaymentLink HTTP ${res.status}` };

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return parseCreatePaymentLinkResponse(json);
}
