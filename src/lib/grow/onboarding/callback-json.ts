/**
 * src/lib/grow/onboarding/callback-json.ts
 *
 * LOCKED parser for the inbound Grow onboarding callback. Confirmed contract:
 * the callback is application/json. There is intentionally NO fallback to
 * form-data / x-www-form-urlencoded — a non-JSON body is rejected.
 *
 * Documented server-update shape (onboarding PDF p.6 "עדכון שרת"):
 *   { "err": null,
 *     "data": { name, phone, api_key, user_id, package_id, package_name,
 *               tracking_code, business_title, tracking_status:{id,message} },
 *     "status": "1" }
 * We also accept a flat (un-nested) variant defensively.
 */

import type { CanonicalOnboardingUpdate } from "./types";

export type ParseResult =
  | { ok: true; update: CanonicalOnboardingUpdate; raw: Record<string, unknown> }
  | { ok: false; reason: "unsupported_content_type" | "invalid_json" | "unexpected_shape" };

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  // Allow charset params, case-insensitive: "application/json", "application/json; charset=utf-8"
  return contentType.toLowerCase().trim().startsWith("application/json");
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Strict parse. Validates content-type is JSON, parses, and maps to the
 * canonical shape. Pure + synchronous → trivially unit-testable.
 */
export function parseOnboardingCallback(rawText: string, contentType: string | null): ParseResult {
  if (!isJsonContentType(contentType)) return { ok: false, reason: "unsupported_content_type" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const root = asRecord(parsed);
  if (!root) return { ok: false, reason: "unexpected_shape" };

  // Fields live under `data` per the doc; fall back to the root for a flat variant.
  const data = asRecord(root.data) ?? root;

  const tsRecord = asRecord(data.tracking_status);
  const trackingStatus = tsRecord
    ? { id: asString(tsRecord.id), message: asString(tsRecord.message) }
    : null;

  const update: CanonicalOnboardingUpdate = {
    name: asString(data.name),
    phone: asString(data.phone),
    growUserId: asString(data.user_id),
    packageId: asString(data.package_id),
    packageName: asString(data.package_name),
    trackingCode: asString(data.tracking_code),
    businessTitle: asString(data.business_title),
    trackingStatus,
    statusRaw: asString(root.status) ?? asString(data.status),
    apiKey: asString(data.api_key),
  };

  return { ok: true, update, raw: root };
}
