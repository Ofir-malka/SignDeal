/**
 * HypBillingProvider — HYP Pay Protocol hosted payment page (APISign flow).
 *
 * Flow:
 *   1. Build params for action=APISign server-to-server request to HYP.
 *   2. POST/GET https://pay.hyp.co.il/p/?action=APISign&… from the Node.js server.
 *   3. HYP validates credentials and returns a signed payment-page URL in the body.
 *   4. Return that URL → caller (checkout route) redirects the browser there.
 *   5. Customer pays on HYP's hosted page (card entry, 3DS, HK recurring setup).
 *   6. HYP redirects to SuccessUrl / ErrorUrl / CancelUrl with signed callback params.
 *
 * This file handles steps 1–4.
 * Step 6 browser-redirect verification (action=APISign&What=VERIFY) is handled
 * by /billing/success server component.
 *
 * ── Security model ─────────────────────────────────────────────────────────────
 * PassP and HYP_API_KEY (KEY) are used ONLY in the server-side fetch (step 2).
 * They are NEVER included in any value returned to the browser.
 * The URL returned by HYP does not contain credentials — it is a signed redirect
 * that HYP itself generated and is safe to forward to the client.
 *
 * Activate with:  BILLING_PROVIDER=hyp
 * Default is:     BILLING_PROVIDER=stub  (safe for dev / staging)
 *
 * Required env vars:
 *   HYP_MASOF     Terminal identifier (Masof) — 10-digit string from HYP portal.
 *   HYP_PASSP     Terminal password (PassP) — from HYP portal. Server-side only.
 *   HYP_API_KEY   SHA-1 APIKey (KEY) — from HYP portal. Required for APISign.
 *                 Server-side only — never sent to the browser.
 *
 * NOTE: the old env vars (HYP_USER, HYP_PASSWORD, HYP_TERMINAL_NUMBER, HYP_MID,
 * HYP_BASE_URL) were used by the previous CreditGuard Relay XML implementation
 * and are no longer read.
 */

import crypto from "crypto";
import type { BillingProvider, CheckoutParams, CheckoutResult } from "../index";

// ── Endpoint ──────────────────────────────────────────────────────────────────

const HYP_PAY_URL = "https://pay.hyp.co.il/p/";

// ── Plan amounts in agorot (100 agorot = ₪1) ─────────────────────────────────
// Kept in sync with src/lib/plans.ts PLAN_PRICES.
// Separate copy here to keep billing/ self-contained (avoids cross-lib coupling).

const PLAN_AMOUNTS: Record<"STANDARD" | "GROWTH" | "PRO", { monthly: number; yearly: number }> = {
  STANDARD: { monthly:  3_900, yearly:  34_800 }, // ₪39/mo  · ₪348/yr
  GROWTH:   { monthly:  4_900, yearly:  46_800 }, // ₪49/mo  · ₪468/yr
  PRO:      { monthly: 11_000, yearly: 118_800 }, // ₪110/mo · ₪1,188/yr
};

// ── Plan labels (shown on HYP payment page via Info param) ───────────────────
// GROWTH uses the masculine form "מתקדם" (מסלול is masculine in Hebrew).

const PLAN_LABELS: Record<"STANDARD" | "GROWTH" | "PRO", string> = {
  STANDARD: "מסלול סטנדרט",
  GROWTH:   "מסלול מתקדם",
  PRO:      "מסלול פרו",
};

// ── Card field parser ─────────────────────────────────────────────────────────
// Exported here so both /billing/success and /api/billing/hyp-notify can share
// the same parsing logic without duplicating it.
//
// HYP callback fields used for card storage:
//   HKId      → cardToken (HYP recurring agreement ID — used for Phase 3 charges)
//   cardMask  → cardLast4 (strip non-digits, take last 4)
//   cardExp   → cardExpMonth + cardExpYear (MMYY format, e.g. "0328" → 3/2028)
//
// IMPORTANT: cardToken (HKId) is the Phase 3 charge cursor.
// Treat as sensitive: never log, never expose to client.

export function parseCardFields(params: {
  HKId?:     string;
  cardToken?: string;
  cardMask?:  string;
  cardExp?:   string;
}): {
  cardToken:    string | null;
  cardLast4:    string | null;
  cardExpMonth: number | null;
  cardExpYear:  number | null;
} {
  // Prefer HKId (recurring agreement) as the persistent token for Phase 3 charges.
  const cardToken = params.HKId?.trim() || params.cardToken?.trim() || null;

  // Extract last 4 digits from cardMask (e.g. "411111*****1111" → "1111").
  let cardLast4: string | null = null;
  if (params.cardMask) {
    const digits = params.cardMask.replace(/\D/g, "");
    if (digits.length >= 4) cardLast4 = digits.slice(-4);
  }

  // Parse MMYY expiry (e.g. "0328" → month=3, year=2028).
  let cardExpMonth: number | null = null;
  let cardExpYear:  number | null = null;
  if (params.cardExp && /^\d{4}$/.test(params.cardExp)) {
    const month = parseInt(params.cardExp.slice(0, 2), 10);
    const year  = 2000 + parseInt(params.cardExp.slice(2, 4), 10);
    if (month >= 1 && month <= 12 && year >= 2020) {
      cardExpMonth = month;
      cardExpYear  = year;
    }
  }

  return { cardToken, cardLast4, cardExpMonth, cardExpYear };
}

// ── Callback MAC verification ─────────────────────────────────────────────────
// Exported here so /billing/success and /api/billing/hyp-notify can share
// the verification algorithm without duplicating it.

/** Query-string params HYP appends to SuccessUrl / ErrorUrl on redirect. */
export interface HypCallbackParams {
  uniqueID:    string;   // our original Order value
  txId:        string;   // HYP transaction ID
  cgUid?:      string;
  cardToken?:  string;   // tokenised card reference — save for recurring
  cardExp?:    string;   // card expiry MMYY       — save for recurring
  cardMask?:   string;   // e.g. "411111******1111" — safe to display
  personalId?: string;
  authNumber?: string;
  HKId?:       string;   // HYP recurring agreement ID (returned when HK=True)
  responseMac: string;   // SHA-256 hex to verify
}

/**
 * Verify the responseMac HYP sends on the success/error redirect.
 *
 * Algorithm (from HYP security docs — plain SHA-256, no HMAC key):
 *   SHA-256( PassP + txId + errorCode + cardToken + cardExp + personalId + uniqueId )
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

// ── getToken: capture 19-digit charge token for action=soft (Phase 3B) ───────
//
// Calls action=getToken with the HYP transaction ID (TransId) to retrieve a
// 19-digit Token usable for server-initiated charges via action=soft.
//
// This token is DIFFERENT from cardToken (HKId):
//   cardToken (HKId) — recurring agreement ID; used for HKStatus only.
//   chargeToken      — 19-digit token; used as CC param in action=soft calls.
//
// Tokef format: YYMM  e.g. "2606" = year 2026, month June.
// Per HYP docs, getToken is valid after CCode=0 and CCode=700 (J5) transactions.
//
// Security: NEVER log the Token value. Log only hasToken presence.

export interface GetTokenResult {
  ok:           boolean;
  token:        string | null;
  tokef:        string | null;    // YYMM e.g. "2606" = June 2026
  cCode:        string;
  cardExpMonth: number | null;    // parsed from Tokef (1–12)
  cardExpYear:  number | null;    // parsed from Tokef (4-digit, e.g. 2026)
}

export async function callGetToken(hypId: string): Promise<GetTokenResult> {
  const masof = process.env.HYP_MASOF?.trim() ?? "";
  const passp = process.env.HYP_PASSP?.trim() ?? "";

  const qp = new URLSearchParams({
    action:  "getToken",
    Masof:   masof,
    PassP:   passp,
    TransId: hypId,
  });

  let raw = "";
  try {
    const resp = await fetch(`${HYP_PAY_URL}?${qp.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    raw = await resp.text().catch(() => "");
  } catch (err) {
    console.warn(
      `[billing/hyp] getToken network error hypId=${hypId}:`,
      err instanceof Error ? err.message : err,
    );
    return { ok: false, token: null, tokef: null, cCode: "999", cardExpMonth: null, cardExpYear: null };
  }

  let cCode = "999";
  let token: string | null = null;
  let tokef: string | null = null;
  try {
    const parsed = new URLSearchParams(raw.trim());
    cCode = parsed.get("CCode") ?? "999";
    token = parsed.get("Token") ?? null;
    tokef = parsed.get("Tokef") ?? null;
  } catch {
    const m = raw.match(/CCode=(\d+)/);
    cCode   = m?.[1] ?? "999";
  }

  // Parse Tokef YYMM → 4-digit year + month (e.g. "2606" → year=2026, month=6)
  let cardExpMonth: number | null = null;
  let cardExpYear:  number | null = null;
  if (tokef && /^\d{4}$/.test(tokef)) {
    const year  = 2000 + parseInt(tokef.slice(0, 2), 10);
    const month = parseInt(tokef.slice(2, 4), 10);
    if (year >= 2020 && month >= 1 && month <= 12) {
      cardExpYear  = year;
      cardExpMonth = month;
    }
  }

  // Log presence only — NEVER log the token value itself.
  console.log(
    `[billing/hyp] getToken` +
    ` CCode="${cCode}"` +
    ` hasToken=${Boolean(token)}` +
    ` tokef="${tokef ?? "(none)"}"` +
    ` cardExpMonth=${cardExpMonth ?? "(none)"}` +
    ` cardExpYear=${cardExpYear ?? "(none)"}`,
  );

  if (cCode !== "0") {
    console.warn(
      `[billing/hyp] getToken failed CCode="${cCode}" hypId=${hypId}` +
      ` raw=${raw.slice(0, 200)}`,
    );
    return { ok: false, token: null, tokef, cCode, cardExpMonth: null, cardExpYear: null };
  }

  return { ok: true, token, tokef, cCode, cardExpMonth, cardExpYear };
}

// ── Provider class ────────────────────────────────────────────────────────────

export class HypBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {

    // ── Read + validate config ───────────────────────────────────────────────
    const masof  = process.env.HYP_MASOF?.trim();
    const passp  = process.env.HYP_PASSP?.trim();
    const apiKey = process.env.HYP_API_KEY?.trim();

    // Log which vars are set — NEVER log their values.
    console.log(
      `[billing/hyp] config check:` +
      ` HYP_MASOF=${Boolean(masof)}` +
      ` HYP_PASSP=${Boolean(passp)}` +
      ` HYP_API_KEY=${Boolean(apiKey)}`,
    );

    if (!masof || !passp || !apiKey) {
      const missing = [
        !masof  && "HYP_MASOF",
        !passp  && "HYP_PASSP",
        !apiKey && "HYP_API_KEY",
      ].filter(Boolean).join(", ");
      return {
        ok:     false,
        reason: `HYP not configured: ${missing} required. Set them from the HYP merchant portal.`,
      };
    }

    // ── Resolve amount ───────────────────────────────────────────────────────
    // PLAN_AMOUNTS stores prices in agorot (100 agorot = ₪1) — the same unit
    // used throughout the codebase for DB columns and fee calculations.
    // HYP's Amount parameter expects whole shekels (ILS), so we divide by 100
    // before sending.  The integer division is exact because all prices are
    // multiples of 100 agorot (no fractional-shekel plans).
    const amounts = PLAN_AMOUNTS[params.plan];
    if (!amounts) {
      return { ok: false, reason: `Unknown plan: ${params.plan}` };
    }
    const amountAgorot = params.interval === "YEARLY" ? amounts.yearly : amounts.monthly;
    // Amount sent to HYP APISign — must be in whole shekels (ILS), not agorot.
    const amountShekels = amountAgorot / 100;

    // ── Generate unique order ID ─────────────────────────────────────────────
    // "sd-" (3) + UUID (36) = 39 chars.
    const order = `sd-${crypto.randomUUID()}`;

    // ── Build Info string ────────────────────────────────────────────────────
    // Shown on the HYP hosted payment page next to the amount.
    // Separator: middle dot U+00B7 " · " — chosen over em-dash U+2014 "—"
    // because HYP's display engine renders the 3-byte em-dash as "?" even
    // with UTF8=True.  The middle dot (2-byte UTF-8) displays correctly.
    const intervalLabel = params.interval === "YEARLY" ? "שנתי" : "חודשי";
    const info = `${PLAN_LABELS[params.plan]} · ${intervalLabel}`;

    // ── Derive ClientName from email ─────────────────────────────────────────
    // HYP shows this on the payment page. Use the local part of the email.
    const clientName = params.userEmail.split("@")[0] ?? params.userEmail;

    // ── Build APISign request params ─────────────────────────────────────────
    // action=APISign + What=SIGN + KEY are required for the server-to-server call.
    // PassP and KEY are ONLY used in this server-side fetch — they are never
    // returned to the browser or included in any client-visible value.
    const qp = new URLSearchParams({
      action:    "APISign",      // ← server-to-server signing request
      What:      "SIGN",         // ← operation type required by APISign
      KEY:       apiKey,         // ← HYP_API_KEY: server-side credential only
      Masof:     masof,
      PassP:     passp,          // ← server-side credential — consumed by HYP, not returned
      // HYP Amount parameter = whole shekels (ILS).
      // amountAgorot is divided by 100 here; internal storage stays in agorot.
      Amount:    String(amountShekels),
      Coin:      "1",            // 1 = ILS
      Info:      info,
      Order:     order,
      UserId:    "000000000",    // Israeli ID — 9 zeros when not required
      ClientName: clientName,
      email:     params.userEmail,
      UTF8:      "True",
      UTF8out:   "True",
      MoreData:  "True",
      SendEmail: "True",
      SuccessUrl: params.successUrl,
      ErrorUrl:   params.errorUrl,
      CancelUrl:  params.cancelUrl,
      // J5=True enables browser redirect to SuccessUrl / ErrorUrl after payment.
      // Without J5, HYP shows its own hosted receipt page and never redirects.
      J5:         "True",
      // SendHesh=True instructs HYP to append signed callback params
      // (txId, uniqueID, responseMac, HKId, cardMask, cardExp, authNumber)
      // to the redirect URL — including when a portal-level URL overrides SuccessUrl.
      SendHesh:   "True",
      // HK module — recurring agreement
      // freq = number of months between charges:
      //   "1"  → charge every 1 month  (MONTHLY billing)
      //   "12" → charge every 12 months (YEARLY billing)
      // Sending freq=1 for yearly plans caused HYP to display "חודשי" on the
      // payment-page header and set up a monthly recurring agreement instead of
      // a yearly one — fixed by deriving freq from params.interval.
      HK:            "True",
      Tash:          "999",  // 999 = unlimited instalments (recurring until cancelled)
      freq:          params.interval === "YEARLY" ? "12" : "1",
      OnlyOnApprove: "True", // redirect to SuccessUrl only on approval; errors go to ErrorUrl
      // Sign=True instructs HYP to include a cryptographic signature (Sign param)
      // in the browser redirect to GoodURL.  Required for What=VERIFY server-side
      // verification in /billing/success.  Without this, VERIFY will fail.
      //
      // IMPORTANT: GoodURL in the HYP portal MUST be set to match SuccessUrl exactly
      // (https://www.signdeal.co.il/billing/success).  If they differ, HYP redirects
      // to the portal GoodURL WITHOUT appending any query params — Sign, Id, Order
      // will all be missing and VERIFY cannot succeed.
      Sign: "True",
    });

    // ── Step 2: server-to-server call to HYP APISign ─────────────────────────
    // HYP validates credentials server-side and returns a signed payment-page
    // URL in the response body. We never log the full request URL (contains PassP).
    // Log the URLserver value (not sensitive — it's our own endpoint URL).
    console.log(
      `[billing/hyp] calling HYP APISign` +
      ` userId=${params.userId.slice(0, 8)}…` +
      ` plan=${params.plan} interval=${params.interval}` +
      ` amount=${amountShekels}nis (${amountAgorot}agorot)` +
      ` order=${order}`,
    );

    let signedUrl: string;
    let httpStatus = 0;
    try {
      const apiSignUrl = `${HYP_PAY_URL}?${qp.toString()}`;
      const response   = await fetch(apiSignUrl, {
        method:  "GET",
        // 10-second timeout — HYP is a payment gateway; we never want to hang forever.
        signal:  AbortSignal.timeout(10_000),
      });

      httpStatus = response.status;
      // Read body once — calling response.text() twice throws "body already consumed".
      const rawBody = await response.text().catch(() => "");

      if (!response.ok) {
        console.error(
          `[billing/hyp] APISign HTTP error — status=${response.status}` +
          ` body=${rawBody.slice(0, 200)}`,
        );
        return {
          ok:     false,
          reason: `HYP APISign returned HTTP ${response.status}: ${rawBody.slice(0, 200)}`,
        };
      }

      signedUrl = rawBody.trim();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[billing/hyp] APISign network error — ${reason}`);
      return { ok: false, reason: `HYP APISign network error: ${reason}` };
    }

    // ── Step 3: normalise the returned body into a full checkout URL ─────────
    //
    // HYP APISign can return the signed payment-page address in two formats:
    //
    //   A) Full URL  — "https://pay.hyp.co.il/p/?action=pay&Amount=…"
    //      Returned by some terminal configurations.  Use as-is.
    //
    //   B) Query-string only — "Amount=…&CancelUrl=…&HK=True&…"
    //      Returned by other terminal configurations.  We prefix HYP_PAY_URL
    //      to build the full URL:  https://pay.hyp.co.il/p/?<body>
    //
    //   C) Error string  — "CCode=902" or similar.
    //      Reject immediately.
    //
    // Detection order: check for explicit error first, then full URL, then
    // query-string.  Anything else is also rejected.

    // Case C — HYP error string (CCode=NNN …).
    if (signedUrl.startsWith("CCode=")) {
      console.error(
        `[billing/hyp] APISign returned error —` +
        ` httpStatus=${httpStatus}` +
        ` order=${order}` +
        ` plan=${params.plan} interval=${params.interval} amount=${amountShekels}nis (${amountAgorot}agorot)` +
        ` body(500)=${signedUrl.slice(0, 500)}`,
      );
      return {
        ok:     false,
        reason: `HYP APISign error response: ${signedUrl.slice(0, 200)}`,
      };
    }

    let checkoutUrl: string;

    if (signedUrl.startsWith("http")) {
      // Case A — HYP returned a full URL directly.
      checkoutUrl = signedUrl;
    } else if (signedUrl.includes("=") && signedUrl.includes("&")) {
      // Case B — HYP returned signed query-string params; prepend the base URL.
      checkoutUrl = `${HYP_PAY_URL}?${signedUrl}`;
    } else {
      // Unrecognised format.
      console.error(
        `[billing/hyp] APISign unrecognised response —` +
        ` httpStatus=${httpStatus}` +
        ` order=${order}` +
        ` plan=${params.plan} interval=${params.interval} amount=${amountShekels}nis (${amountAgorot}agorot)` +
        ` body(500)=${signedUrl.slice(0, 500)}`,
      );
      return {
        ok:     false,
        reason: `HYP APISign unrecognised response: ${signedUrl.slice(0, 200)}`,
      };
    }

    // ── Step 4: safety checks on the final URL ────────────────────────────────
    // 1. Must be an HTTPS URL served by pay.hyp.co.il/p/ — never an arbitrary host.
    // 2. Must NOT contain PassP= or KEY= — credentials must never reach the browser.
    if (!checkoutUrl.startsWith("https://pay.hyp.co.il/p/")) {
      console.error(
        `[billing/hyp] APISign URL failed host check —` +
        ` order=${order} urlPrefix=${checkoutUrl.slice(0, 60)}`,
      );
      return {
        ok:     false,
        reason: "HYP APISign returned URL with unexpected host. Check HYP_MASOF / HYP_PASSP / HYP_API_KEY.",
      };
    }

    if (checkoutUrl.includes("PassP=") || checkoutUrl.includes("KEY=")) {
      // This must never happen — log without the URL itself (it may contain secrets).
      console.error(
        `[billing/hyp] APISign URL contains credentials — order=${order}` +
        ` containsPassP=${checkoutUrl.includes("PassP=")}` +
        ` containsKEY=${checkoutUrl.includes("KEY=")}`,
      );
      return {
        ok:     false,
        reason: "HYP APISign response contained credentials. Aborting for security.",
      };
    }

    console.log(
      `[billing/hyp] APISign success —` +
      ` order=${order}` +
      ` responseFormat=${signedUrl.startsWith("http") ? "full-url" : "query-string"}` +
      ` urlLength=${checkoutUrl.length}`,
    );

    // checkoutUrl is the HYP-generated payment page URL.
    // It does NOT contain PassP or KEY — safe to send to the browser.
    return { ok: true, checkoutUrl, order };
  }
}
