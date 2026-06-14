/**
 * src/lib/payments/providers/grow/webhook-capture.ts
 *
 * P3a CAPTURE-ONLY helpers for the Grow CreatePaymentLink server-to-server
 * callback. Pure parse + sanitize so we can learn the EXACT payload shape without
 * marking anything paid. No secret VALUES are ever returned: keys matching
 * token/apiKey/secret are redacted, and PAN-like digit runs are masked — field
 * NAMES are always preserved so we can inspect the structure.
 *
 * No I/O here (the route does the DB write); these functions are unit-tested.
 */

const REDACT_KEY = /(token|api[_-]?key|secret|password|cvv|cvc)/i;
const PAN_RUN = /\b\d{13,19}\b/g;
const MAX_STR = 200;

export type CallbackKind = "json" | "form" | "empty" | "unknown";

/** Parse a raw callback body by content-type. Pure; never throws. */
export function parseCallbackBody(
  rawText: string,
  contentType: string | null,
): { kind: CallbackKind; data: Record<string, unknown> | null } {
  const ct = (contentType ?? "").toLowerCase();
  const body = rawText ?? "";
  if (!body.trim()) return { kind: "empty", data: null };

  if (ct.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      return {
        kind: "json",
        data: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { value: parsed },
      };
    } catch {
      return { kind: "unknown", data: null };
    }
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    return { kind: "form", data: formToObject(body) };
  }

  // No / unexpected content-type → best effort: try JSON, then form, else unknown.
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") return { kind: "json", data: parsed as Record<string, unknown> };
  } catch {
    /* fall through */
  }
  if (body.includes("=")) {
    const obj = formToObject(body);
    if (Object.keys(obj).length) return { kind: "form", data: obj };
  }
  return { kind: "unknown", data: null };
}

function formToObject(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

/** Recursively redact secret values; keep keys + non-secret values. Pure. */
export function sanitizeForCapture(value: unknown): unknown {
  if (typeof value === "string") {
    const masked = value.replace(PAN_RUN, "[redacted-pan]");
    return masked.length > MAX_STR ? masked.slice(0, MAX_STR) + "…" : masked;
  }
  if (Array.isArray(value)) return value.map(sanitizeForCapture);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? "[redacted]" : sanitizeForCapture(v);
    }
    return out;
  }
  return value;
}

/** Redact a raw string body for preview when structured parsing failed. Pure. */
export function redactRawPreview(rawText: string): string {
  const redacted = (rawText ?? "")
    .replace(
      /((?:token|api[_-]?key|secret|password|cvv|cvc)[^=&":]*["']?\s*[=:]\s*["']?)([^&"',}\s]+)/gi,
      "$1[redacted]",
    )
    .replace(PAN_RUN, "[redacted-pan]");
  return redacted.length > 1000 ? redacted.slice(0, 1000) + "…" : redacted;
}
