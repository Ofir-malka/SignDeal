/**
 * src/lib/billing/providers/grow/parse-response.ts — PURE parsers. No I/O, no logging.
 */

import type { GrowSaasTokenCheckoutResult, GrowSaasSavedToken } from "./types";

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
/** Recursively find the first value whose key matches the pattern. */
function deepFind(v: unknown, re: RegExp): unknown {
  const o = rec(v);
  if (o) {
    for (const [k, val] of Object.entries(o)) {
      if (re.test(k)) return val;
      const n = deepFind(val, re);
      if (n !== undefined) return n;
    }
  } else if (Array.isArray(v)) {
    for (const item of v) {
      const n = deepFind(item, re);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

/** Parse a createPaymentProcess response → { ok, url, processId, processToken } | error. */
export function parseTokenCheckoutResponse(json: unknown): GrowSaasTokenCheckoutResult {
  const root = rec(json);
  const status = root ? str(root.status) : null;
  if (status !== "1") {
    const err = root ? rec(root.err) : null;
    const errId = err && typeof err.id === "number" ? err.id : null;
    const message = err ? str(err.message) : null;
    return { ok: false, reason: message ?? `createPaymentProcess status=${status ?? "null"}`, errId };
  }
  const data = root ? rec(root.data) : null;
  const url = data ? str(data.url) : null;
  const processId = data ? str(data.processId) : null;
  const processToken = data ? str(data.processToken) : null;
  if (!url || !processId) return { ok: false, reason: "missing url/processId in createPaymentProcess response" };
  return { ok: true, url, processId, processToken };
}

/**
 * Extract the saved-token info from a getPaymentProcessInfo `data` object. Deep-scans
 * for the few fields we need (shape is field-level confirmed). Returns null if neither
 * statusCode nor cardToken is present yet (still processing).
 */
export function findSavedToken(data: unknown): GrowSaasSavedToken | null {
  const statusCode = str(deepFind(data, /^statuscode$/i));
  const cardToken = str(deepFind(data, /^card_?token$/i));
  if (statusCode == null && cardToken == null) return null;
  return {
    statusCode,
    cardToken,
    cardSuffix: str(deepFind(data, /card_?suffix|last_?4/i)),
    cField1: str(deepFind(data, /^cfield1$/i)),
    processId: str(deepFind(data, /^processid$/i)),
  };
}
