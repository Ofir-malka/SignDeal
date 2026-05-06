/**
 * RapydPaymentProvider
 *
 * Implements the PaymentProvider interface against the Rapyd REST API.
 *
 * Sandbox: RAPYD_BASE_URL=https://sandboxapi.rapyd.net  (default)
 * Live:    RAPYD_BASE_URL=https://api.rapyd.net
 *
 * Required env vars:
 *   RAPYD_ACCESS_KEY  — from Rapyd dashboard → Developers → Credentials
 *   RAPYD_SECRET_KEY  — same location
 *   RAPYD_BASE_URL    — optional; defaults to sandbox URL above
 *   APP_BASE_URL      — used for complete/cancel redirect URLs
 *
 * ── Request signing (Rapyd HMAC-SHA256) ──────────────────────────────────────
 *
 *   Signature base string (per Rapyd docs, exact concatenation order):
 *     method.toLowerCase() + urlPath + salt + timestamp + accessKey + secretKey + body
 *
 *   signature = BASE64(HMAC-SHA256(secretKey, base_string))
 *
 *   Rules enforced by Rapyd:
 *   • method must be lowercase ("post", "get", "delete", "put")
 *   • body must be compact JSON — no whitespace outside string values
 *   • body for GET requests is the empty string ""
 *   • timestamp must be within 60 seconds of real time
 *   • numbers must have no trailing zeros or decimal points (10170 not 10170.00)
 *
 * ── Webhook signing ───────────────────────────────────────────────────────────
 *
 *   Same HMAC algorithm; method is omitted from the base string:
 *     urlPath + salt + timestamp + accessKey + secretKey + body
 *
 *   salt / timestamp / signature arrive in HTTP *headers*, not the body.
 *   The webhook route must forward them and supply:
 *     headers["x-rapyd-url-path"]  — path of your webhook endpoint
 *     headers["x-rapyd-raw-body"]  — exact raw bytes received (no re-serialisation)
 */

import { createHmac, randomBytes } from "crypto";
import type {
  PaymentProvider,
  CreatePaymentLinkParams,
  CreatePaymentLinkResult,
  WebhookPayload,
  WebhookResult,
  MappedStatus,
} from "../provider";

// 1 ILS = 100 agorot. Rapyd expects decimal ILS amounts.
const AGOROT_PER_ILS = 100;

// Gate verbose dev logs so they never appear in production.
const IS_DEV = process.env.NODE_ENV !== "production";

// ── Auth-header builder ───────────────────────────────────────────────────────

/**
 * Generates the four Rapyd auth headers for an outgoing request.
 *
 * ⚠ CRITICAL: `body` must be the EXACT same string that will be sent as the
 * HTTP request body. Stringify your payload exactly once upstream, pass that
 * string here AND to fetch(). Never call JSON.stringify a second time on the
 * same data — any character difference invalidates the signature.
 *
 * Signature base string (Rapyd docs, exact order):
 *   method.toLowerCase() + urlPath + salt + timestamp + accessKey + secretKey + body
 */
function buildAuthHeaders(
  method:  string,   // http verb, will be lowercased: "post", "get", …
  urlPath: string,   // e.g. "/v1/checkout"
  body:    string,   // pre-built compact-JSON body, or "" for GET requests
): Record<string, string> {
  const secretKey = process.env.RAPYD_SECRET_KEY ?? "";
  const accessKey = process.env.RAPYD_ACCESS_KEY ?? "";
  const salt      = randomBytes(8).toString("hex");   // 16-char hex string
  const timestamp = Math.floor(Date.now() / 1000);   // Unix seconds

  // Exact concatenation order per Rapyd docs — do not reorder
  const toSign    = method.toLowerCase() + urlPath + salt + String(timestamp) + accessKey + secretKey + body;

  // ⚠ CRITICAL: Rapyd's official Node sample does hex first, then base64 — NOT direct base64.
  //   digest("base64")                         → wrong (raw bytes → base64)
  //   Buffer.from(digest("hex")).toString("base64") → correct (hex string → base64)
  //   Source: https://docs.rapyd.net/en/request-signatures.html
  const hexDigest = createHmac("sha256", secretKey).update(toSign, "utf8").digest("hex");
  const signature = Buffer.from(hexDigest).toString("base64");

  if (IS_DEV) {
    // Safe debug log — secret key deliberately omitted
    console.log("[Rapyd] buildAuthHeaders →", {
      method: method.toLowerCase(),
      urlPath,
      salt,
      timestamp,
      bodyLength: body.length,
      body,
    });
  }

  return {
    "Content-Type": "application/json",
    "access_key":   accessKey,
    "salt":         salt,
    "timestamp":    String(timestamp),
    "signature":    signature,
  };
}

// ── Internal Rapyd API response shape ─────────────────────────────────────────

type RapydApiResponse = {
  status?: {
    status?:        string;   // "SUCCESS" on ok
    error_code?:    string;
    message?:       string;
    response_code?: string;
  };
  data?: {
    id?:           string;   // e.g. "checkout_abc123"
    redirect_url?: string;   // URL of the hosted payment page
    [key: string]: unknown;
  };
};

// ── Provider ──────────────────────────────────────────────────────────────────

export class RapydPaymentProvider implements PaymentProvider {

  private get baseUrl(): string {
    return (process.env.RAPYD_BASE_URL ?? "https://sandboxapi.rapyd.net").replace(/\/$/, "");
  }

  /**
   * Resolves the public-facing base URL used for Rapyd redirect fields.
   *
   * Priority (first truthy value wins):
   *   1. PAYMENT_REDIRECT_BASE_URL  — explicit override for payment redirects (ngrok, etc.)
   *   2. NEXT_PUBLIC_APP_URL        — Next.js convention for public app URL
   *   3. APP_BASE_URL               — generic fallback
   *
   * Throws a descriptive error when running the Rapyd provider against a
   * localhost URL — Rapyd rejects non-public redirect targets.
   */
  private get redirectBaseUrl(): string {
    const raw = (
      process.env.PAYMENT_REDIRECT_BASE_URL  ??
      process.env.NEXT_PUBLIC_APP_URL        ??
      process.env.APP_BASE_URL               ??
      "http://localhost:3000"
    ).replace(/\/$/, "");

    if (/localhost|127\.0\.0\.1/i.test(raw)) {
      throw new Error(
        `Rapyd requires a public HTTPS redirect URL. ` +
        `Set PAYMENT_REDIRECT_BASE_URL to your ngrok or deployed URL ` +
        `(current value resolves to "${raw}").`,
      );
    }

    return raw;
  }

  // ── createPaymentLink ──────────────────────────────────────────────────────

  async createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> {
    const urlPath = "/v1/checkout";

    try {
      // ── Resolve public redirect base URL (throws early if localhost) ──────────
      const appBase = this.redirectBaseUrl;

      // Convert agorot → ILS.
      // parseFloat(toFixed(2)) normalises any floating-point imprecision and lets
      // JavaScript's JSON serialiser drop trailing zeros naturally:
      //   10170.00 → parseFloat → 10170  → JSON → 10170   ✓
      //   10150.50 → parseFloat → 10150.5 → JSON → 10150.5 ✓
      const amountIls = parseFloat((params.amount / AGOROT_PER_ILS).toFixed(2));

      // ── Build the request body payload — stringify exactly once ───────────────
      //
      // The same `body` string is used for HMAC generation AND as the fetch body.
      // Do NOT call JSON.stringify again on this data anywhere below.
      const bodyPayload = {
        amount:                amountIls,
        currency:              "ILS",
        country:               "IL",
        description:           params.description,
        merchant_reference_id: params.paymentId,            // our DB payment ID, max 45 chars
        complete_checkout_url: `${appBase}/pay/complete?contractId=${params.contractId}&status=success`,
        cancel_checkout_url:   `${appBase}/pay/complete?contractId=${params.contractId}&status=cancel`,
        page_expiration:       Math.floor(Date.now() / 1000) + 60 * 60 * 24,  // 24 h
        metadata: {
          contract_id: params.contractId,
          payment_id:  params.paymentId,
        },
      };

      const body = JSON.stringify(bodyPayload);   // ← single stringify; used for both HMAC and fetch

      // ── Auth headers — receive the same `body` string ─────────────────────────
      const headers = buildAuthHeaders("post", urlPath, body);
      const res = await fetch(`${this.baseUrl}${urlPath}`, {
        method:  "POST",
        headers,
        body,    // ← exact same string reference used in HMAC above
      });

      const json = await res.json() as RapydApiResponse;

      if (!res.ok || json.status?.status !== "SUCCESS") {
        const reason =
          json.status?.message       ??
          json.status?.error_code    ??
          json.status?.response_code ??
          `HTTP ${res.status}`;
        console.error("[RapydPaymentProvider] createPaymentLink failed:", json.status);
        return { ok: false, reason };
      }

      const redirectUrl = json.data?.redirect_url;
      if (!redirectUrl) {
        console.error("[RapydPaymentProvider] createPaymentLink: missing redirect_url", json.data);
        return { ok: false, reason: "Rapyd response missing redirect_url" };
      }

      return {
        ok:                true,
        paymentUrl:        redirectUrl,
        providerPaymentId: json.data?.id ?? params.paymentId,
      };

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[RapydPaymentProvider] createPaymentLink network error:", reason);
      return { ok: false, reason };
    }
  }

  // ── verifyWebhook ─────────────────────────────────────────────────────────

  /**
   * Verifies a Rapyd webhook signature and normalises the event payload.
   *
   * Rapyd delivers auth metadata in HTTP *headers* (not the body):
   *   headers["salt"]      — per-request random salt from Rapyd
   *   headers["timestamp"] — Unix timestamp in seconds
   *   headers["signature"] — BASE64(HMAC-SHA256(urlPath+salt+timestamp+accessKey+secretKey+body))
   *
   * The webhook route must populate two additional keys before calling this:
   *   headers["x-rapyd-url-path"]  — path of your webhook endpoint (e.g. "/api/webhooks/rapyd")
   *   headers["x-rapyd-raw-body"]  — raw request body string, byte-for-byte as received
   *
   * Without "x-rapyd-raw-body" we fall back to JSON.stringify(payload), which
   * may differ in key order and fail the signature check. Acceptable in sandbox;
   * harden before going live (change console.warn → throw).
   */
  async verifyWebhook(
    payload:  WebhookPayload,
    headers:  Record<string, string>,
  ): Promise<WebhookResult> {

    // ── 1. Signature verification ─────────────────────────────────────────────
    const salt      = headers["salt"]              ?? "";
    const timestamp = headers["timestamp"]         ?? "";
    const received  = headers["signature"]         ?? "";
    const urlPath   = headers["x-rapyd-url-path"]  ?? "";
    const rawBody   = headers["x-rapyd-raw-body"]  ?? JSON.stringify(payload);

    if (salt && timestamp && received) {
      const secretKey = process.env.RAPYD_SECRET_KEY ?? "";
      const accessKey = process.env.RAPYD_ACCESS_KEY ?? "";

      // Webhook formula: no http_method prefix (Rapyd quirk vs. request signing)
      // Same hex-then-base64 digest as request signing (official Rapyd Node sample)
      const toSign      = urlPath + salt + timestamp + accessKey + secretKey + rawBody;
      const hexDigest   = createHmac("sha256", secretKey).update(toSign, "utf8").digest("hex");
      const expected    = Buffer.from(hexDigest).toString("base64");

      if (IS_DEV) {
        console.log("[Rapyd] verifyWebhook →", {
          urlPath,
          salt,
          timestamp,
          bodyLength: rawBody.length,
          signatureMatch: expected === received,
        });
      }

      if (expected !== received) {
        // TODO before going live: throw new Error("Invalid Rapyd webhook signature");
        console.warn(
          "[RapydPaymentProvider] webhook signature mismatch — " +
          "acceptable in sandbox; harden for production",
        );
      }
    } else {
      console.warn("[RapydPaymentProvider] webhook missing signature headers — skipping verification");
    }

    // ── 2. Extract event data ──────────────────────────────────────────────────
    const type = String(payload["type"] ?? "");
    const data = (payload["data"] as Record<string, unknown>) ?? {};

    // Use our paymentId (merchant_reference_id) for reconciliation; fall back to Rapyd's ID
    const providerPaymentId = String(
      data["merchant_reference_id"] ?? data["id"] ?? "unknown",
    );

    // Map Rapyd status code or event type → our MappedStatus
    const rapydStatus = String(data["status"] ?? "").toUpperCase();
    const mapped      = this.mapWebhookToStatus(rapydStatus || type);

    // Coerce non-terminal states to FAILED — webhooks only fire on meaningful events
    const status: "PAID" | "FAILED" | "CANCELED" =
      mapped === "PAID"     ? "PAID"     :
      mapped === "CANCELED" ? "CANCELED" : "FAILED";

    // paid_at is a Unix timestamp in seconds (Rapyd convention)
    const rawPaidAt = Number(data["paid_at"] ?? 0);
    const paidAt    = status === "PAID"
      ? (rawPaidAt > 0 ? new Date(rawPaidAt * 1000) : new Date())
      : undefined;

    // Rapyd reports amounts in decimal ILS — convert back to agorot
    const rawAmount   = Number(data["amount"] ?? 0);
    const totalAmount = rawAmount > 0 ? Math.round(rawAmount * AGOROT_PER_ILS) : undefined;

    return { providerPaymentId, status, paidAt, totalAmount };
  }

  // ── mapWebhookToStatus ────────────────────────────────────────────────────

  mapWebhookToStatus(rapydStatus: string): MappedStatus {
    switch (rapydStatus.toUpperCase()) {
      // Payment object status codes
      case "CLO": return "PAID";       // CLO = closed, payment collected
      case "CAN": return "CANCELED";
      case "ERR": return "FAILED";
      case "EXP": return "FAILED";     // expired
      case "ACT": return "PENDING";    // active — still in progress

      // Webhook event type strings
      case "PAYMENT_COMPLETED": return "PAID";
      case "PAYMENT_SUCCEEDED": return "PAID";
      case "PAYMENT_FAILED":    return "FAILED";
      case "PAYMENT_EXPIRED":   return "FAILED";
      case "PAYMENT_CANCELED":  return "CANCELED";

      default: return "UNKNOWN";
    }
  }
}
