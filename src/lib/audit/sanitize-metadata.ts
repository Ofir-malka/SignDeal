/**
 * src/lib/audit/sanitize-metadata.ts
 *
 * Pure sanitization logic for AuditLog metadata.
 * No external dependencies — safe to import in unit tests and edge runtimes.
 *
 * Exported and used by:
 *   - log-audit-event.ts   (runtime helper)
 *   - sanitize-metadata.test.ts  (unit tests)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum character length for any individual string value in metadata.
 * Values exceeding this are truncated + "…".
 */
export const MAX_STRING_LENGTH = 500;

/**
 * Keys whose values are always stripped from metadata, at any nesting depth.
 * Matching is performed on the lowercased, de-hyphenated/de-underscored key name.
 * Any key whose normalized form *contains* one of these substrings is removed.
 */
export const BLOCKED_KEY_SUBSTRINGS: readonly string[] = [
  "cardtoken",
  "chargetoken",
  "hkid",
  "passwordhash",
  "password",
  "signaturetoken",
  "secret",
  "apikey",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "token",          // catches: token, refreshToken, cardToken, authToken, etc.
  "privatekey",
  "signaturedata",  // base64 PNG — large and not audit-relevant
  "hypraw",         // raw HYP response; may contain card-adjacent values
];

// ── Patterns ──────────────────────────────────────────────────────────────────

/** Israeli ID number: exactly 9 decimal digits. */
const ID_NUMBER_PATTERN = /^\d{9}$/;

/**
 * Israeli mobile / landline phone after stripping spaces, dashes, dots, parens.
 * Covers: 05x-xxxxxxx, 0x-xxxxxxx, +972 5x xxxxxxx variants.
 */
const PHONE_PATTERN = /^(?:\+972|0)(5\d{8}|\d{8,9})$/;

/** Simplified RFC 5322 email — "something@something.something". */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Key normalization ─────────────────────────────────────────────────────────

function isBlockedKey(key: string): boolean {
  // Normalize: lower-case + remove separators so "card_token", "card-token",
  // "CardToken", and "cardToken" all map to "cardtoken".
  const normalized = key.toLowerCase().replace(/[_\-. ]/g, "");
  return BLOCKED_KEY_SUBSTRINGS.some((blocked) => normalized.includes(blocked));
}

// ── Core recursive sanitizer ──────────────────────────────────────────────────

/**
 * Recursively sanitize a single value at any nesting depth.
 * @internal — call sanitizeMetadata() from outside this module.
 */
function sanitizeValue(value: unknown, emailLoggingAllowed: boolean): unknown {
  if (value === null || value === undefined) return value;

  // ── Array: recurse into each element ────────────────────────────────────────
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, emailLoggingAllowed));
  }

  // ── Object: sanitize key-by-key ─────────────────────────────────────────────
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(input)) {
      // Rule 1 — blocked key name: drop the key entirely
      if (isBlockedKey(key)) continue;

      // For string values apply rules 2–5 before recursion
      if (typeof val === "string") {
        const trimmed = val.trim();

        // Rule 2 — Israeli ID number (9 digits): replace with presence flag
        if (ID_NUMBER_PATTERN.test(trimmed)) {
          result[`${key}_present`] = true;
          // Do not write the key itself — the value is PII
          continue;
        }

        // Rule 3 — Phone number: keep only last 4 digits
        const phoneNorm = val.replace(/[\s\-.()]/g, "");
        if (PHONE_PATTERN.test(phoneNorm)) {
          result[key] = `***${phoneNorm.slice(-4)}`;
          continue;
        }

        // Rule 4 — Email address: redact unless explicitly allowed
        if (!emailLoggingAllowed && EMAIL_PATTERN.test(trimmed)) {
          result[key] = "[email redacted]";
          continue;
        }

        // Rule 5 — String too long: truncate
        if (val.length > MAX_STRING_LENGTH) {
          result[key] = val.slice(0, MAX_STRING_LENGTH) + "…";
          continue;
        }

        // Passed all rules — keep as-is
        result[key] = val;
        continue;
      }

      // Non-string value — recurse
      result[key] = sanitizeValue(val, emailLoggingAllowed);
    }

    return result;
  }

  // ── Primitive (string at top of array / number / boolean) ───────────────────
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
    return value.slice(0, MAX_STRING_LENGTH) + "…";
  }
  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Recursively sanitize a metadata object before it is written to AuditLog.
 *
 * Rules applied at every nesting level:
 *   1. Blocked keys (BLOCKED_KEY_SUBSTRINGS match on normalized key) → dropped.
 *   2. String matching Israeli ID pattern (9 digits) → `[key]` dropped, `[key]_present = true` added.
 *   3. String matching phone pattern → replaced with `***XXXX` (last 4 digits).
 *   4. String matching email pattern → replaced with `"[email redacted]"` unless
 *      `emailLoggingAllowed = true`.
 *   5. String longer than MAX_STRING_LENGTH → truncated + "…".
 *   6. Arrays and nested objects → recursed into.
 *
 * Does NOT mutate the input object.
 *
 * @param obj                 The raw metadata object from the caller.
 * @param emailLoggingAllowed When true, email-shaped strings are kept verbatim.
 * @returns A new object safe for storage in AuditLog.metadata.
 */
export function sanitizeMetadata(
  obj: Record<string, unknown>,
  emailLoggingAllowed: boolean = false,
): Record<string, unknown> {
  return sanitizeValue(obj, emailLoggingAllowed) as Record<string, unknown>;
}
