/**
 * src/lib/billing/providers/grow/status-codes.ts — PURE Grow Rail A recurring-charge
 * statusCode mapping. No I/O, no logging, no .reveal().
 *
 * Maps a createTransactionWithToken (SignDeal → Grow) result into the billing outcome the
 * recurring engine acts on. This concerns the SERVER-TO-GROW CHARGE response ONLY — it is
 * NOT a Grow → SignDeal webhook payload (the webhook dispatcher is a separate future phase).
 *
 * Sandbox-validated statusCodes: "2" = charged/paid, "11" = saved-not-charged (unexpected on
 * a charge → treated as an anomaly/error). Decline / 3DS / insufficient-funds codes are
 * UNCONFIRMED — unknown codes default conservatively to "declined" (a soft, retryable
 * failure) and NEVER to "paid". A request/config error (top-level err.id, e.g. 54/1013) or a
 * transport failure maps to "error" — our fault, not a card decline (must not burn dunning).
 */

import type { GrowChargeHttpResult } from "./types";

export type GrowChargeOutcome = "paid" | "declined" | "error";

export interface GrowChargeClassification {
  outcome: GrowChargeOutcome;
  statusCode: string | null;
  transactionId: string | null;
  approvalCode: string | null;
  /** Diagnostic tag for "error"/"declined" outcomes; null for "paid". Never a secret. */
  reasonTag: string | null;
}

/**
 * Per-transaction statusCode catalogue — the SINGLE SOURCE OF TRUTH for the charge outcome.
 * TODO(grow-prod): extend with real decline / 3DS / insufficient-funds codes once confirmed.
 */
export const GROW_CHARGE_STATUS_CODES: Record<string, { outcome: GrowChargeOutcome; label: string }> = {
  "2": { outcome: "paid", label: "charged / paid" },
  "11": { outcome: "error", label: "token saved, not charged (anomaly on a charge call)" },
};

/**
 * Classify a createTransactionWithToken result. Precedence (checked before the statusCode
 * catalogue): transport failure → config/err.id → status≠"1" → then the catalogue, with
 * unknown statusCodes falling back to a conservative "declined".
 */
export function classifyGrowCharge(result: GrowChargeHttpResult): GrowChargeClassification {
  // ── Transport-level failures (surfaced by the HTTP layer) ─────────────────
  if (result.transport === "token_missing") {
    return { outcome: "error", statusCode: null, transactionId: null, approvalCode: null, reasonTag: "ERR_TOKEN_MISSING" };
  }
  if (result.transport === "network_error") {
    return { outcome: "error", statusCode: null, transactionId: null, approvalCode: null, reasonTag: "ERR_TRANSPORT" };
  }

  const { status, statusCode, errId, transactionId, approvalCode } = result;

  // ── Request/config error (our bug, e.g. err 54/1013) — never dun the card ──
  if (errId != null) {
    return { outcome: "error", statusCode, transactionId, approvalCode, reasonTag: `ERR_CONFIG_${errId}` };
  }
  // ── Request not accepted by Grow ──────────────────────────────────────────
  if (status !== "1") {
    return { outcome: "error", statusCode, transactionId, approvalCode, reasonTag: `ERR_STATUS_${status ?? "null"}` };
  }

  // ── Per-transaction statusCode (catalogue is source of truth) ─────────────
  const known = statusCode != null ? GROW_CHARGE_STATUS_CODES[statusCode] : undefined;
  if (known?.outcome === "paid") {
    return { outcome: "paid", statusCode, transactionId, approvalCode, reasonTag: null };
  }
  if (known?.outcome === "error") {
    return { outcome: "error", statusCode, transactionId, approvalCode, reasonTag: `ERR_ANOMALY_${statusCode}` };
  }

  // ── Unknown / catalogued-decline → conservative decline (retryable), never paid ──
  return { outcome: "declined", statusCode, transactionId, approvalCode, reasonTag: `DECLINE_${statusCode ?? "UNKNOWN"}` };
}
