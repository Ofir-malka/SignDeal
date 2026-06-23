/**
 * src/lib/billing/onboarding-eligibility.ts — entry-routing policy for the billing
 * onboarding/upgrade checkout (/api/billing/checkout).
 *
 * An existing PAST_DUE subscriber must be routed to the RECOVERY flow, NOT a normal
 * onboarding/upgrade checkout: the onboarding bridge only activates INCOMPLETE→TRIALING,
 * so a PAST_DUE user routed there dead-ends on a "verification failed" screen (and a
 * stray purpose="checkout" / cField1="saas_token_setup" session gets created).
 *
 * Scope (this pass): PAST_DUE only. ACTIVE/TRIALING (upgrades), INCOMPLETE (genuine
 * onboarding), CANCELED/EXPIRED (re-subscribe) are all allowed through. EXPIRED-with-
 * failures reactivation is a separate, deliberate follow-up — NOT included here.
 */

/** Code returned by /api/billing/checkout when the caller must use recovery instead. */
export const USE_RECOVERY_CODE = "USE_RECOVERY";

/** Path the client redirects to on USE_RECOVERY_CODE. */
export const RECOVERY_PATH = "/settings/billing/recover";

/** True when an existing subscriber must use recovery rather than start a checkout. */
export function requiresRecovery(status: string | null | undefined): boolean {
  return status === "PAST_DUE";
}
