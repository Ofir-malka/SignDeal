/**
 * src/lib/billing/providers/grow/createTransactionWithToken.http.ts — RAIL A recurring
 * charge (SignDeal → Grow). Charges a saved cardToken with NO user interaction.
 *
 * This is the ONLY `.reveal()` site for the Grow SaaS cardToken + merchant apiKey in the
 * recurring charge flow. Server-side only. Returns a discriminated GrowChargeHttpResult —
 * NEVER throws, NEVER logs a secret, NEVER persists the raw Grow response body.
 *
 * SERVER-TO-GROW CHARGE request/response ONLY — this is NOT a Grow → SignDeal webhook
 * payload (the webhook dispatcher is a separate future phase, untouched here).
 */

import { getGrowSaasBillingCredentials, getGrowSaasMerchantApiKey } from "@/lib/billing/secrets";
import { SecretNotFoundError } from "@/lib/secrets/errors";
import {
  agorotToShekels,
  buildTokenChargeFields,
  growTransactionUid,
  tokenChargeCField1,
} from "./request-builder";
import { parseTokenChargeResponse } from "./parse-response";
import {
  getGrowSaasCreateTransactionWithTokenUrl,
  getGrowSaasUserId,
  getGrowSaasPageCode,
} from "./config";
import type { GrowChargeHttpResult } from "./types";

const TIMEOUT_MS = 15_000;
const USER_AGENT = "SignDeal-SaaS-Billing/1.0";

export interface GrowSaasTokenChargeArgs {
  /** Subscription.id — used to load the sealed cardToken via the Rail A secret facade. */
  subscriptionId: string;
  /** Charge amount in agorot (converted to Grow's shekel `sum` string). */
  amountAgorot: number;
  /** BillingCharge.id — the stable seed for transactionUniqueIdentifier + cField1. */
  chargeId: string;
  /** Human description shown on the Grow charge (e.g. "plan · interval"). */
  description: string;
}

/**
 * Execute a server-initiated Grow token charge (createTransactionWithToken).
 * Loads + reveals the cardToken and merchant apiKey HERE only, builds the multipart
 * form, posts it, and returns a parsed result. A missing/purged token (or unconfigured
 * merchant credentials) maps to `token_missing`; network/timeout/non-200 maps to
 * `network_error`; an accepted HTTP exchange maps to `ok` with the parsed body.
 */
export async function createGrowSaasTokenCharge(
  args: GrowSaasTokenChargeArgs,
): Promise<GrowChargeHttpResult> {
  // ── Load + reveal secrets (THE only reveal site in the recurring charge flow) ──
  let fields: Record<string, string>;
  try {
    const creds = await getGrowSaasBillingCredentials({ subscriptionId: args.subscriptionId });
    const apiKey = await getGrowSaasMerchantApiKey();
    fields = buildTokenChargeFields({
      pageCode: getGrowSaasPageCode(),
      userId: getGrowSaasUserId(),
      apiKey: apiKey.reveal(),                   // reveal ONLY here
      cardToken: creds.chargeToken.reveal(),     // reveal ONLY here
      sumShekels: agorotToShekels(args.amountAgorot),
      description: args.description,
      cField1: tokenChargeCField1(args.chargeId),
      transactionUniqueIdentifier: growTransactionUid(args.chargeId),
    });
  } catch (err) {
    // A missing/purged token (ref column set but secret gone) or unconfigured merchant
    // credentials/config surfaces as a setup failure — distinct from a card decline, so the
    // engine flags it as an integration error (no dunning). Never a transport error here.
    return {
      transport: "token_missing",
      reason: err instanceof SecretNotFoundError
        ? err.message
        : err instanceof Error ? err.message : "credentials/config error",
    };
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(getGrowSaasCreateTransactionWithTokenUrl(), {
      method: "POST",
      headers: { "User-Agent": USER_AGENT }, // do NOT set Content-Type — fetch adds the multipart boundary
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "transport error";
    return { transport: "network_error", reason: `createTransactionWithToken request failed (${reason})` };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status !== 200) {
    return { transport: "network_error", reason: `createTransactionWithToken HTTP ${res.status}` };
  }

  // Parse only the fields we need; the raw body is never stored or logged.
  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { transport: "ok", ...parseTokenChargeResponse(json) };
}
