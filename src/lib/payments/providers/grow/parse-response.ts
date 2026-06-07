/**
 * src/lib/payments/providers/grow/parse-response.ts — PURE parser.
 *
 * Maps Grow's `{ status, err, data }` envelope to a discriminated result.
 * Success (status 1) → { url, processId, processToken }. Anything else → ok:false.
 */

import type { GrowCreatePaymentResult } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function parseCreatePaymentProcessResponse(json: unknown): GrowCreatePaymentResult {
  const root = asRecord(json);
  if (!root) return { ok: false, reason: "empty or non-JSON response" };

  const statusOne = root.status === 1 || root.status === "1";
  if (statusOne) {
    const data = asRecord(root.data);
    const url = data ? asString(data.url) : null;
    if (!url) return { ok: false, reason: "success status but no payment url in response" };
    return {
      ok: true,
      paymentUrl: url,
      processId: (data && asString(data.processId)) ?? "",
      processToken: data ? asString(data.processToken) : null,
    };
  }

  const err = asRecord(root.err);
  if (err) return { ok: false, reason: asString(err.message) ?? "Grow error", errId: asNum(err.id) };
  return { ok: false, reason: asString(root.err) ?? "Grow returned a non-success status" };
}
