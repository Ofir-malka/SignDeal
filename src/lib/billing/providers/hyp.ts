/**
 * HypBillingProvider — HYP Pay Protocol hosted payment page.
 *
 * Flow:
 *   1. Build a signed redirect URL to https://pay.hyp.co.il/p/
 *   2. Return that URL → caller (checkout route) redirects the browser there
 *   3. Customer pays on HYP's hosted page (card entry, 3DS, etc.)
 *   4. HYP redirects to SuccessUrl / ErrorUrl / CancelUrl with query params
 *
 * This file handles steps 1–2 only.
 * Step 4 callback verification is handled by /billing/success (see verifyHypResponseMac below).
 *
 * Activate with:  BILLING_PROVIDER=hyp
 * Default is:     BILLING_PROVIDER=stub  (safe for dev / staging)
 *
 * Required env vars:
 *   HYP_MASOF     Terminal identifier (Masof) — 10-digit string from HYP merchant portal.
 *   HYP_PASSP     Terminal password (PassP) — from HYP merchant portal.
 *
 * Optional env vars:
 *   HYP_API_KEY   SHA-1 KEY — reserved for Soft Protocol (server-to-server recurring charge).
 *                 Not used for initial checkout. Set it now for future use.
 *
 * NOTE: the old env vars (HYP_USER, HYP_PASSWORD, HYP_TERMINAL_NUMBER, HYP_MID, HYP_BASE_URL)
 * were used by the previous CreditGuard Relay XML implementation and are no longer read.
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

    // ── Read config ──────────────────────────────────────────────────────────
    const masof = process.env.HYP_MASOF?.trim();
    const passp = process.env.HYP_PASSP?.trim();

    // Log which vars are set — never log their values.
    console.log(
      `[billing/hyp] config check:` +
      ` HYP_MASOF=${Boolean(masof)}` +
      ` HYP_PASSP=${Boolean(passp)}` +
      ` HYP_API_KEY=${Boolean(process.env.HYP_API_KEY)} (reserved/future)`,
    );

    if (!masof || !passp) {
      return {
        ok:     false,
        reason:
          "HYP not configured: HYP_MASOF and HYP_PASSP are required. " +
          "Set them from the HYP merchant portal.",
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

    // ── Build Pay Protocol URL ───────────────────────────────────────────────
    // All params that may contain non-ASCII or special chars must be
    // percent-encoded. URLSearchParams handles this automatically.
    const qp = new URLSearchParams({
      action:    "pay",
      Masof:     masof,
      PassP:     passp,
      Amount:    String(amount),
      Coin:      "1",           // 1 = ILS
      Info:      info,
      Order:     order,
      UserId:    "000000000",   // Israeli ID — 9 zeros when not required
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

    const checkoutUrl = `${HYP_PAY_URL}?${qp.toString()}`;

    // Log enough to trace in dev — PassP and full URL never logged.
    console.log(
      `[billing/hyp] Pay Protocol URL built` +
      ` userId=${params.userId.slice(0, 8)}…` +
      ` plan=${params.plan} interval=${params.interval}` +
      ` amount=${amount}agorot order=${order}`,
    );

    return { ok: true, checkoutUrl, order };
  }
}
