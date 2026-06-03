/**
 * src/lib/grow/config.ts
 *
 * Server-only env resolution for the Grow onboarding integration. Every read
 * hits process.env at CALL time (never import time) so a build / a flags-off
 * deployment never throws — only an actual GetLink call requires the credentials.
 *
 * Secrets (platform x-api-key, marketer, callback token) are read from server
 * env names only — never NEXT_PUBLIC, never logged.
 */

import { GrowConfigError } from "./errors";

// ── Constants ────────────────────────────────────────────────────────────────

/** Sandbox GetLink endpoint (confirmed: onboarding PDF p.3 + Postman collection). */
export const SANDBOX_GETLINK_URL = "https://devregisterapi.meshulam.co.il/GetLink";

/** Path our callback route is mounted at (the routeToken is appended). */
export const ONBOARDING_CALLBACK_PATH = "/api/grow/onboarding/callback";

const DEFAULT_USER_AGENT = "SignDeal-Onboarding/1.0";
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function boolEnv(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

function reqEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new GrowConfigError(`${name} is not configured (server env)`);
  return v;
}

function optEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v === "" ? null : v;
}

// ── Feature flags (both default OFF) ─────────────────────────────────────────

/** Master switch. When false, start makes NO Grow call and the callback defers. */
export function isOnboardingEnabled(): boolean {
  return boolEnv("GROW_ONBOARDING_ENABLED");
}

/**
 * When false (default), a successful callback moves the session to
 * PENDING_VERIFICATION and leaves the merchant inactive. Phase 2B NEVER
 * auto-activates regardless of this flag (origin-auth is still unconfirmed);
 * the flag exists so a later phase can gate activation on it.
 */
export function isAutoActivateEnabled(): boolean {
  return boolEnv("GROW_ONBOARDING_AUTO_ACTIVATE");
}

// ── Environment + endpoints ──────────────────────────────────────────────────

export function growEnvironment(): "sandbox" | "production" {
  const v = (process.env.GROW_ENVIRONMENT ?? "sandbox").trim().toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

/** GetLink endpoint for the active environment. Production URL is required-when-prod. */
export function getLinkUrl(): string {
  if (growEnvironment() === "production") {
    const url = optEnv("GROW_GETLINK_URL_PRODUCTION");
    if (!url) {
      throw new GrowConfigError(
        "GROW_GETLINK_URL_PRODUCTION is not configured (production GetLink host is still a Grow open item)",
      );
    }
    return url;
  }
  return optEnv("GROW_GETLINK_URL_SANDBOX") ?? SANDBOX_GETLINK_URL;
}

// ── Credentials (required only when actually calling GetLink) ─────────────────

/** Platform `x-api-key` header value. */
export function getPlatformApiKey(): string {
  return reqEnv("GROW_PLATFORM_API_KEY");
}

/** GetLink `marketer` body value (security access key). */
export function getMarketerId(): string {
  return reqEnv("GROW_MARKETER_ID");
}

export function getUserAgent(): string {
  return optEnv("GROW_USER_AGENT") ?? DEFAULT_USER_AGENT;
}

/** `price_quote` (package code). Caller-supplied wins; else the env default. */
export function resolvePriceQuote(supplied?: string): string {
  const v = (supplied ?? "").trim();
  if (v) return v;
  const def = optEnv("GROW_DEFAULT_PRICE_QUOTE");
  if (!def) {
    throw new GrowConfigError(
      "no price_quote supplied and GROW_DEFAULT_PRICE_QUOTE is not configured",
    );
  }
  return def;
}

export function httpTimeoutMs(): number {
  const v = parseInt(process.env.GROW_HTTP_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_HTTP_TIMEOUT_MS;
}

// ── Callback URL + token ─────────────────────────────────────────────────────

/** The fixed env-level route token Grow's callbacks must carry. Null if unset. */
export function getCallbackToken(): string | null {
  return optEnv("GROW_ONBOARDING_CALLBACK_TOKEN");
}

/** Public base URL used only to render the callback URL we hand to Grow. */
export function getPublicBaseUrl(): string | null {
  return optEnv("GROW_PUBLIC_BASE_URL");
}

/**
 * The full callback URL to give Grow (sandbox: for a manual test fire; prod:
 * for the fixed partner-level config). NOT used to receive — the route's path
 * param carries the token at runtime. Returns null if base/token are unset.
 */
export function getOnboardingCallbackUrl(): string | null {
  const base = getPublicBaseUrl();
  const token = getCallbackToken();
  if (!base || !token) return null;
  return `${base.replace(/\/$/, "")}${ONBOARDING_CALLBACK_PATH}/${token}`;
}
