/**
 * HypBillingProvider — HYP (CreditGuard engine) hosted payment page.
 *
 * Two-step flow:
 *   1. Server-to-server POST to HYP Relay → receive mpiHostedPageUrl
 *   2. Return that URL → caller redirects the browser there
 *   3. Customer pays on HYP's hosted page
 *   4. HYP redirects to successUrl / errorUrl / cancelUrl (GET with query params)
 *
 * This file handles step 1–2 only.
 * Step 4 callback verification: verifyHypResponseMac() is exported here
 * for use by the future /billing/success handler — no DB writes yet.
 *
 * Activate with:  BILLING_PROVIDER=hyp
 * Default is:     BILLING_PROVIDER=stub  (safe for dev/staging)
 *
 * Required env vars:
 *   HYP_USER              API username  (from HYP merchant portal)
 *   HYP_PASSWORD          API password  (from HYP merchant portal)
 *   HYP_TERMINAL_NUMBER   10-char terminal ID, e.g. "AB12345678"
 *
 * Optional env vars:
 *   HYP_MID               Merchant ID — omit <mid> tag entirely if unset.
 *                         Some terminals work without it; include only if
 *                         HYP support confirms it is needed for your account.
 *   HYP_BASE_URL          Defaults to UAT sandbox (cguat2.creditguard.co.il)
 *                         Set to your assigned production domain for live.
 */

import crypto from "crypto";
import type { BillingProvider, CheckoutParams, CheckoutResult } from "../index";

// ── Endpoint constants ────────────────────────────────────────────────────────

/** HYP UAT (sandbox) relay endpoint. The production URL is merchant-specific
 *  and is assigned by HYP during onboarding (pattern: xxx.creditguard.co.il). */
const UAT_BASE_URL = "https://cguat2.creditguard.co.il";
const RELAY_PATH   = "/xpo/Relay";

// ── Plan amounts in agorot (100 agorot = ₪1) ─────────────────────────────────
// Kept in sync with src/lib/plans.ts PLAN_PRICES.
// Separate copy here to keep billing/ self-contained (avoids cross-lib coupling).

const PLAN_AMOUNTS: Record<"STANDARD" | "GROWTH" | "PRO", { monthly: number; yearly: number }> = {
  STANDARD: { monthly:  3_900, yearly:  34_800 }, // ₪39/mo  · ₪348/yr
  GROWTH:   { monthly:  4_900, yearly:  46_800 }, // ₪49/mo  · ₪468/yr
  PRO:      { monthly: 11_000, yearly: 118_800 }, // ₪110/mo · ₪1,188/yr
};

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Escape the five XML-reserved characters so URL/string values are safe. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;");
}

interface DoDealXmlParams {
  terminalNumber: string;
  mid?:           string;   // optional — tag omitted entirely when absent
  total:          number;   // in agorot
  uniqueid:       string;   // ≤64 chars, unique within 24 h
  successUrl:     string;
  errorUrl:       string;
  cancelUrl:      string;
  plan:           string;   // stored in userData1 for recovery on return
  interval:       string;   // stored in userData2
  userId:         string;   // first 64 chars stored in userData3
}

/**
 * Build the doDeal XML payload for a one-time hosted-page payment.
 *
 * cardNo=CGMPI  tells HYP this is a payment-page transaction (card unknown yet).
 * validation=TxnSetup  creates the hosted page session.
 * mpiValidation=AutoComm  one-phase: immediate authorise + capture.
 * creditType=RegularCredit  single charge, no instalments.
 */
function buildDoDealXml(p: DoDealXmlParams): string {
  return `<ashrait>
  <request>
    <version>2000</version>
    <language>HEB</language>
    <command>doDeal</command>
    <doDeal>
      <terminalNumber>${escapeXml(p.terminalNumber)}</terminalNumber>
      ${p.mid ? `<mid>${escapeXml(p.mid)}</mid>` : "<!-- mid omitted: HYP_MID not set -->"}
      <cardNo>CGMPI</cardNo>
      <total>${p.total}</total>
      <transactionType>Debit</transactionType>
      <creditType>RegularCredit</creditType>
      <currency>ILS</currency>
      <transactionCode>Internet</transactionCode>
      <validation>TxnSetup</validation>
      <mpiValidation>AutoComm</mpiValidation>
      <uniqueid>${escapeXml(p.uniqueid)}</uniqueid>
      <successUrl>${escapeXml(p.successUrl)}</successUrl>
      <errorUrl>${escapeXml(p.errorUrl)}</errorUrl>
      <cancelUrl>${escapeXml(p.cancelUrl)}</cancelUrl>
      <userData1>${escapeXml(p.plan)}</userData1>
      <userData2>${escapeXml(p.interval)}</userData2>
      <userData3>${escapeXml(p.userId.slice(0, 64))}</userData3>
    </doDeal>
  </request>
</ashrait>`;
}

// ── XML response parsing ──────────────────────────────────────────────────────
// HYP returns a predictable, shallow XML envelope.
// A full XML parser is not needed — simple tag extraction is safe and avoids
// adding a dependency.

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
  return match ? match[1].trim() : "";
}

interface RelayResponse {
  result:           string;   // "000" = success; anything else = error
  message:          string;   // system result message
  userMessage:      string;   // localised user-facing message (often more descriptive)
  tranId:           string;   // HYP transaction identifier
  cgUid:            string;   // CreditGuard internal unique ID
  mpiHostedPageUrl: string;   // one-time payment page URL (valid 10 min)
}

function parseRelayResponse(xml: string): RelayResponse {
  return {
    result:           extractXmlTag(xml, "result"),
    message:          extractXmlTag(xml, "message"),
    userMessage:      extractXmlTag(xml, "userMessage"),
    tranId:           extractXmlTag(xml, "tranId"),
    cgUid:            extractXmlTag(xml, "cgUid"),
    mpiHostedPageUrl: extractXmlTag(xml, "mpiHostedPageUrl"),
  };
}

/**
 * Strip the mpiHostedPageUrl value from a raw XML response string before
 * logging. The URL contains a single-use session token — never log it.
 */
function sanitizeResponseForLog(xml: string): string {
  return xml
    .replace(/<mpiHostedPageUrl>[^<]*<\/mpiHostedPageUrl>/g,
      "<mpiHostedPageUrl>[redacted]</mpiHostedPageUrl>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);   // cap at 600 chars; enough for any error response
}

// ── Callback MAC verification ─────────────────────────────────────────────────
// Exported here so the future /api/billing/success (or /api/billing/webhook)
// handler can import and use it without duplicating the algorithm.

/** Query-string params HYP appends to successUrl / errorUrl on redirect. */
export interface HypCallbackParams {
  uniqueID:    string;   // our original uniqueid
  txId:        string;   // HYP transaction ID
  cgUid?:      string;
  cardToken?:  string;   // tokenised card reference — save for recurring
  cardExp?:    string;   // card expiry MMYY       — save for recurring
  cardMask?:   string;   // e.g. "411111******1111" — safe to display
  personalId?: string;
  authNumber?: string;
  responseMac: string;   // SHA-256 hex to verify
}

/**
 * Verify the responseMac HYP sends on the success/error redirect.
 *
 * Algorithm (from HYP security docs — no HMAC key, plain SHA-256):
 *   SHA-256( password + txId + errorCode + cardToken + cardExp + personalId + uniqueId )
 *
 * Returns true if authentic, false if the MAC does not match (tampered / replay).
 *
 * IMPORTANT: call this before trusting any callback parameter.
 * Never update the DB on a callback that fails this check.
 */
export function verifyHypResponseMac(
  cb:       HypCallbackParams,
  password: string,
): boolean {
  const base =
    password          +
    cb.txId           +
    "000"             +   // errorCode — use "000" on the success path
    (cb.cardToken  ?? "") +
    (cb.cardExp    ?? "") +
    (cb.personalId ?? "") +
    cb.uniqueID;

  const expected = crypto.createHash("sha256").update(base).digest("hex");

  // Constant-time comparison to resist timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(cb.responseMac),
    );
  } catch {
    // Buffers of different lengths — definitely not equal.
    return false;
  }
}

// ── Provider class ────────────────────────────────────────────────────────────

export class HypBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {

    // ── Read config ──────────────────────────────────────────────────────────
    const user           = process.env.HYP_USER?.trim();
    const password       = process.env.HYP_PASSWORD?.trim();
    const terminalNumber = process.env.HYP_TERMINAL_NUMBER?.trim();
    const mid            = process.env.HYP_MID?.trim() || undefined;  // optional
    const baseUrl        = (process.env.HYP_BASE_URL?.trim() ?? UAT_BASE_URL).replace(/\/$/, "");

    // Log which vars are set — never log their values.
    console.log(
      `[billing/hyp] config check:` +
      ` HYP_USER=${Boolean(user)}` +
      ` HYP_PASSWORD=${Boolean(password)}` +
      ` HYP_TERMINAL_NUMBER=${Boolean(terminalNumber)}` +
      ` HYP_MID=${Boolean(mid)} (optional)` +
      ` HYP_BASE_URL=${baseUrl}`,
    );

    if (!user || !password || !terminalNumber) {
      return {
        ok:     false,
        reason:
          "HYP not configured: HYP_USER, HYP_PASSWORD, and " +
          "HYP_TERMINAL_NUMBER are required. HYP_MID is optional.",
      };
    }

    // ── Resolve amount ───────────────────────────────────────────────────────
    const amounts = PLAN_AMOUNTS[params.plan];
    if (!amounts) {
      return { ok: false, reason: `Unknown plan: ${params.plan}` };
    }
    const total = params.interval === "YEARLY" ? amounts.yearly : amounts.monthly;

    // ── Generate unique transaction ID ───────────────────────────────────────
    // Prefix "sd-" makes it easy to find in HYP merchant console.
    // "sd-" (3) + UUID (36) = 39 chars — well within the 64-char limit.
    const uniqueid = `sd-${crypto.randomUUID()}`;

    // ── Build XML payload ────────────────────────────────────────────────────
    const xml = buildDoDealXml({
      terminalNumber,
      mid,
      total,
      uniqueid,
      successUrl: params.successUrl,
      errorUrl:   params.cancelUrl,  // HYP's errorUrl = failure / error path
      cancelUrl:  params.cancelUrl,
      plan:       params.plan,
      interval:   params.interval,
      userId:     params.userId,
    });

    // ── POST to HYP Relay ────────────────────────────────────────────────────
    const relayUrl = `${baseUrl}${RELAY_PATH}`;

    // Log enough to trace in dev — credentials and full XML never logged.
    console.log(
      `[billing/hyp] POST ${relayUrl}` +
      ` userId=${params.userId.slice(0, 8)}…` +
      ` plan=${params.plan} interval=${params.interval}` +
      ` total=${total}agorot uniqueid=${uniqueid}`,
    );

    let rawResponse: string;
    try {
      const formBody = new URLSearchParams({ user, password, int_in: xml });

      const res = await fetch(relayUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    formBody.toString(),
      });

      if (!res.ok) {
        return {
          ok:     false,
          reason: `HYP Relay HTTP ${res.status}: ${res.statusText}`,
        };
      }

      rawResponse = await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Network error calling HYP Relay: ${msg}` };
    }

    // ── Parse XML response ───────────────────────────────────────────────────
    const parsed = parseRelayResponse(rawResponse);

    if (parsed.result !== "000") {
      // On error: log sanitized body (mpiHostedPageUrl redacted) + both message fields.
      // This is the primary debugging surface for 405 / terminal config errors.
      console.error(
        `[billing/hyp] relay ERROR` +
        ` result=${parsed.result}` +
        ` message="${parsed.message}"` +
        ` userMessage="${parsed.userMessage}"` +
        ` tranId=${parsed.tranId || "(none)"}` +
        `\n[billing/hyp] sanitized response: ${sanitizeResponseForLog(rawResponse)}`,
      );
      return {
        ok:     false,
        reason:
          `HYP error ${parsed.result}: ${parsed.userMessage || parsed.message || "no message"}`,
      };
    }

    // On success: log minimal info — never log the hosted URL (one-time token).
    console.log(
      `[billing/hyp] relay OK` +
      ` result=${parsed.result}` +
      ` tranId=${parsed.tranId}` +
      ` hasUrl=${Boolean(parsed.mpiHostedPageUrl)}`,
    );

    if (!parsed.mpiHostedPageUrl) {
      return {
        ok:     false,
        reason:
          "HYP returned result=000 but mpiHostedPageUrl was absent. " +
          "Check terminal configuration with HYP support.",
      };
    }

    // mpiHostedPageUrl is valid for 10 minutes and is single-use.
    return { ok: true, checkoutUrl: parsed.mpiHostedPageUrl };
  }
}
