/**
 * src/lib/billing/grow-phone.ts — shared Grow (Rail A) phone policy.
 *
 * Grow's hosted page (createPaymentProcess) REQUIRES a valid Israeli LOCAL phone in
 * pageField[phone] — a leading "0" followed by 8–9 more digits (landline 0X-XXXXXXX
 * = 9 digits, mobile 05X-XXXXXXX = 10 digits). A missing/invalid phone is rejected by
 * Grow with "לא נשלח שם וטלפון או שאינו תקין".
 *
 * Every Grow billing ENTRY route (checkout, payment-method/update, recover) normalizes
 * + validates the broker's profile phone with these helpers BEFORE calling Grow, so a
 * bad profile value fails fast with a clear 400 instead of a confusing provider 500.
 * This is the SINGLE SOURCE OF TRUTH for the policy — do not inline the regex elsewhere.
 *
 * Note: country-code forms (e.g. "+972...") are intentionally REJECTED — once stripped to
 * digits they no longer start with "0", which is the local format Grow's page expects.
 */

/** Israeli local format Grow accepts: leading 0 + 8–9 more digits (9–10 digits total). */
export const GROW_PHONE_RE = /^0\d{8,9}$/;

/** Strip every non-digit (spaces, dashes, parens, a leading "+") → bare digit string. */
export function normalizeGrowPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** True iff the profile phone, once normalized, matches Grow's required local format. */
export function isValidGrowPhone(raw: string | null | undefined): boolean {
  return GROW_PHONE_RE.test(normalizeGrowPhone(raw));
}
