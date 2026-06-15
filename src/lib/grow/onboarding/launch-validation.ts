/**
 * Pure, framework-free validation helpers for the Grow pre-iframe launch form
 * (GrowLaunchForm). Kept next to the other onboarding logic so they are unit-
 * tested with vitest (node env) — there is no DOM/component test setup. No DOM
 * and no imports here, so this file is safe to import from the client component.
 *
 * Light validation by design (per product decision): Grow re-validates the full
 * business details inside its hosted form, so a false rejection here is worse
 * than letting Grow decide. No ת.ז/ח.פ check-digit (Luhn) validation.
 */

/** Israeli mobile: starts with 05, exactly 10 digits, digits only. */
export function isValidIsraeliMobile(phone: string): boolean {
  return /^05\d{8}$/.test(phone);
}

/** Business number / ת.ז / ח.פ: digits only, 8–9 digits. No check-digit. */
export function isValidBusinessNumber(businessNumber: string): boolean {
  return /^\d{8,9}$/.test(businessNumber);
}

/** Keep only digits — used to sanitize input as the user types or pastes. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Pure gating predicate for the Continue button (testable without a DOM). */
export function canContinue(args: {
  phone: string;
  businessNumber: string;
  consent: boolean;
  submitting: boolean;
}): boolean {
  return (
    isValidIsraeliMobile(args.phone) &&
    isValidBusinessNumber(args.businessNumber) &&
    args.consent &&
    !args.submitting
  );
}
