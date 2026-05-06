/**
 * Normalizes an Israeli mobile/landline phone number to E.164 format.
 *
 * Accepted inputs:
 *   0501234567     → +972501234567
 *   050-123-4567   → +972501234567
 *   050 123 4567   → +972501234567
 *   972501234567   → +972501234567
 *   +972501234567  → +972501234567  (already correct — passed through)
 *
 * Returns the original string unchanged if it cannot be normalized,
 * so callers can still attempt the send and let Infobip reject it
 * with a clear provider error rather than silently dropping the message.
 */
export function normalizeIsraeliPhone(phone: string): string {
  // Strip everything except digits and a leading +
  const stripped = phone.replace(/[^\d+]/g, "");

  // Already E.164 with Israeli country code
  if (stripped.startsWith("+972")) return stripped;

  // Digits only, with country code but no +
  if (stripped.startsWith("972")) return `+${stripped}`;

  // Local format — leading 0 (mobile: 05X, landline: 0X)
  if (stripped.startsWith("0")) return `+972${stripped.slice(1)}`;

  // Cannot normalize — return as-is so the error surfaces at the provider
  return phone;
}
