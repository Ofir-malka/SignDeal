/**
 * src/lib/grow/onboarding/callback-url.ts
 *
 * The single "static / manual-support" callback-URL strategy.
 *
 * - Grow configures the callback URL on THEIR side (sandbox: manual test fire;
 *   prod: fixed partner-level URL). We never register it via API and never send
 *   it in GetLink — so registration is a no-op; we only PUBLISH the URL (for the
 *   handoff/runbook) and VERIFY the env-level route token on inbound callbacks.
 */

import { timingSafeEqual } from "node:crypto";
import { getCallbackToken, getOnboardingCallbackUrl } from "../config";

/** The URL to hand Grow (or null if base/token unset). For ops/runbook display. */
export function getConfiguredCallbackUrl(): string | null {
  return getOnboardingCallbackUrl();
}

/** Registration is performed manually by Grow — nothing to do at runtime. */
export function registerCallbackUrl(): void {
  /* no-op: fixed/manual-support strategy */
}

/**
 * Constant-time compare of the path's routeToken against the configured token.
 * Fail-closed: returns false if no token is configured or lengths differ.
 */
export function verifyRouteToken(provided: string | undefined | null): boolean {
  const expected = getCallbackToken();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal lengths
  return timingSafeEqual(a, b);
}
