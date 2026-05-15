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
 * Step 6 callback verification is handled by /billing/success (verifyHypResponseMac).
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

const PLAN_LABELS: Record<"STANDARD" | "GROWTH" | "PRO", string> = {
  STANDARD: "מסלול סטנדרט",
  GROWTH:   "מסלול מתקדמת",
  PRO:      "מסלול פרו",
};

// ── Callback MAC verification ─────────────────────────────────────────────────
// Exported here so /billing/success can import without duplicating the algorithm.

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
    const amounts = PLAN_AMOUNTS[params.plan];
    if (!amounts) {
      return { ok: false, reason: `Unknown plan: ${params.plan}` };
    }
    const amount = params.interval === "YEARLY" ? amounts.yearly : amounts.monthly;

    // ── Generate unique order ID ─────────────────────────────────────────────
    // "sd-" (3) + UUID (36) = 39 chars.
    const order = `sd-${crypto.randomUUID()}`;

    // ── Build Info string ────────────────────────────────────────────────────
    const intervalLabel = params.interval === "YEARLY" ? "שנתי" : "חודשי";
    const info = `${PLAN_LABELS[params.plan]} — ${intervalLabel}`;

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
      Amount:    String(amount),
      Coin:      "1",            // 1 = ILS
      Info:      info,
      Order:     order,
      UserId:    "000000000",    // Israeli ID — 9 zeros when not required
      ClientName: clientName,
      email:     params.userEmail,
      UTF8:      "True",
      UTF8out:   "True",
      MoreData:  "True",
      sendemail: "True",
      SuccessUrl: params.successUrl,
      ErrorUrl:   params.errorUrl,
      CancelUrl:  params.cancelUrl,
      // HK module — monthly recurring agreement
      HK:            "True",
      Tash:          "999",  // 999 = unlimited instalments (recurring until cancelled)
      freq:          "1",    // 1 = monthly
      OnlyOnApprove: "True", // redirect to SuccessUrl only on approval; errors go to ErrorUrl
    });

    // ── Step 2: server-to-server call to HYP APISign ─────────────────────────
    // HYP validates credentials server-side and returns a signed payment-page
    // URL in the response body. We never log the full request URL (contains PassP).
    console.log(
      `[billing/hyp] calling HYP APISign` +
      ` userId=${params.userId.slice(0, 8)}…` +
      ` plan=${params.plan} interval=${params.interval}` +
      ` amount=${amount}agorot order=${order}`,
    );

    let signedUrl: string;
    try {
      const apiSignUrl = `${HYP_PAY_URL}?${qp.toString()}`;
      const response   = await fetch(apiSignUrl, {
        method:  "GET",
        // 10-second timeout — HYP is a payment gateway; we never want to hang forever.
        signal:  AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `[billing/hyp] APISign HTTP error — status=${response.status}` +
          ` body=${body.slice(0, 200)}`,
        );
        return {
          ok:     false,
          reason: `HYP APISign returned HTTP ${response.status}`,
        };
      }

      signedUrl = (await response.text()).trim();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[billing/hyp] APISign network error — ${reason}`);
      return { ok: false, reason: `HYP APISign network error: ${reason}` };
    }

    // ── Step 3: validate the returned URL ────────────────────────────────────
    // HYP should return a full HTTPS URL we can redirect the browser to.
    // A minimal sanity check: must start with https:// and contain pay.hyp.co.il.
    // This guards against empty bodies, error strings, or unexpected formats.
    if (!signedUrl.startsWith("https://") || !signedUrl.includes("pay.hyp.co.il")) {
      console.error(
        `[billing/hyp] APISign returned unexpected body — expected signed URL, ` +
        `got: ${signedUrl.slice(0, 120)}`,
      );
      return {
        ok:     false,
        reason: "HYP APISign did not return a valid signed URL. Check HYP_MASOF / HYP_PASSP / HYP_API_KEY.",
      };
    }

    console.log(
      `[billing/hyp] APISign success — signed URL received` +
      ` order=${order}` +
      ` urlLength=${signedUrl.length}`,
    );

    // signedUrl is the HYP-generated payment page URL.
    // It does NOT contain PassP or KEY — safe to send to the browser.
    return { ok: true, checkoutUrl: signedUrl, order };
  }
}
