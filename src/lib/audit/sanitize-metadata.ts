/**
 * src/lib/audit/sanitize-metadata.ts
 *
 * Pure sanitization logic for AuditLog metadata.
 * No external dependencies — safe to import in unit tests and edge runtimes.
 *
 * Exported and used by:
 *   - log-audit-event.ts   (runtime helper)
 *   - sanitize-metadata.test.ts  (unit tests)
 *
 * Guarantees:
 *   • Deep-REBUILD: always returns a NEW object/array tree (never input refs).
 *   • Depth + breadth caps + cycle detection (defends against hostile/huge input).
 *   • RevealableSecret (or a prototype-stripped copy carrying the brand) → "[secret]"
 *     BEFORE any serialization, so a thrown toJSON is a backstop, never the path.
 *   • Binary blobs (Buffer / TypedArray / ArrayBuffer) → redacted, never stringified.
 *   • Value-pattern masking: PAN (Luhn) / IL-IBAN / high-entropy token / long hex.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum character length for any individual string value. Longer → truncated + "…". */
export const MAX_STRING_LENGTH = 500;

/** Maximum recursion depth. Deeper nodes collapse to "[depth limit]". */
export const MAX_DEPTH = 8;

/** Maximum array elements / object keys retained at any level (breadth cap). */
export const MAX_BREADTH = 1000;

/** Well-known brand for RevealableSecret (see src/lib/secrets/revealable-secret.ts). */
const REVEALABLE_SECRET_BRAND = Symbol.for("signdeal.revealableSecret");

/**
 * Keys whose values are always stripped from metadata, at any nesting depth.
 * Matching is performed on the lowercased, alphanumeric-only key name.
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
  // ── Grow / payments additions (Phase 1) ──
  "accountnum",     // bank account number
  "accountname",
  "bankaccount",
  "iban",
  "authcode",       // Grow approval / auth code
  "encryptedlead",  // Grow onboarding encrypted lead payload
  "cardnumber",
  "cvv",
  "cvc",
  "branchnum",
  "swift",
  "routingnum",
  // ── HTTP auth material ──
  "authorization",
  "bearer",
  "cookie",
  "setcookie",
];

// ── Value patterns ──────────────────────────────────────────────────────────

/** Israeli ID number: exactly 9 decimal digits. */
const ID_NUMBER_PATTERN = /^\d{9}$/;

/**
 * Israeli mobile / landline phone after stripping spaces, dashes, dots, parens.
 * Covers: 05x-xxxxxxx, 0x-xxxxxxx, +972 5x xxxxxxx variants.
 */
const PHONE_PATTERN = /^(?:\+972|0)(5\d{8}|\d{8,9})$/;

/** Simplified RFC 5322 email — "something@something.something". */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** PAN candidate: 13–19 digits after removing spaces/dashes (then Luhn-checked). */
const PAN_CANDIDATE_PATTERN = /^\d{13,19}$/;

/** Israeli IBAN: IL + 2 check digits + 19 alphanumerics. */
const IL_IBAN_PATTERN = /^IL\d{2}[A-Z0-9]{19}$/;

/** High-entropy opaque token (also requires a letter AND a digit; threshold 32 spares cuids/handles). */
const HIGH_ENTROPY_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

/** Long hex blob (PKCS#7 / Apple-Google-Pay payloads). Also requires a digit (spares degenerate all-letter strings). */
const LONG_HEX_PATTERN = /^[0-9a-fA-F]{256,}$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isBlockedKey(key: string): boolean {
  // Normalize: lower-case + strip ALL non-alphanumerics so "card_token",
  // "card-token", "card token", "CardToken" all map to "cardtoken".
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return BLOCKED_KEY_SUBSTRINGS.some((blocked) => normalized.includes(blocked));
}

/** Standard Luhn checksum (PAN validation). */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Apply scalar string masking. Returns the (possibly redacted) string.
 * Most-specific patterns first. Does NOT handle the Israeli-ID → `_present`
 * transform, which requires renaming the key and stays in the object path.
 */
function maskScalarString(val: string, emailLoggingAllowed: boolean): string {
  const trimmed = val.trim();

  // PAN (13–19 digits passing Luhn) → ****last4
  const panCleaned = trimmed.replace(/[\s-]/g, "");
  if (PAN_CANDIDATE_PATTERN.test(panCleaned) && passesLuhn(panCleaned)) {
    return `****${panCleaned.slice(-4)}`;
  }

  // Israeli IBAN
  if (IL_IBAN_PATTERN.test(trimmed)) {
    return "[iban redacted]";
  }

  // Phone → last 4 digits
  const phoneNorm = val.replace(/[\s\-.()]/g, "");
  if (PHONE_PATTERN.test(phoneNorm)) {
    return `***${phoneNorm.slice(-4)}`;
  }

  // Email → placeholder unless explicitly allowed
  if (!emailLoggingAllowed && EMAIL_PATTERN.test(trimmed)) {
    return "[email redacted]";
  }

  // Long hex blob (must contain a digit → spares degenerate all-letter strings)
  if (LONG_HEX_PATTERN.test(trimmed) && /\d/.test(trimmed)) {
    return `[redacted hex len=${trimmed.length}]`;
  }

  // High-entropy opaque token (must contain a letter AND a digit)
  if (
    HIGH_ENTROPY_PATTERN.test(trimmed) &&
    /[A-Za-z]/.test(trimmed) &&
    /\d/.test(trimmed)
  ) {
    return `[redacted len=${trimmed.length}]`;
  }

  // Too long → truncate
  if (val.length > MAX_STRING_LENGTH) {
    return val.slice(0, MAX_STRING_LENGTH) + "…";
  }

  return val;
}

// ── Core recursive sanitizer ──────────────────────────────────────────────────

/**
 * Recursively sanitize a single value at any nesting depth.
 * @internal — call sanitizeMetadata() from outside this module.
 */
function sanitizeValue(
  value: unknown,
  emailLoggingAllowed: boolean,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  // ── RevealableSecret (real instance OR prototype-stripped brand carrier) ────
  if (
    typeof value === "object" &&
    (value as Record<symbol, unknown>)[REVEALABLE_SECRET_BRAND] === true
  ) {
    return "[secret]";
  }

  // ── Binary blobs → redact, never stringify ──────────────────────────────────
  if (value instanceof ArrayBuffer) return `[bytes len=${value.byteLength}]`;
  if (ArrayBuffer.isView(value)) {
    return `[bytes len=${(value as ArrayBufferView).byteLength}]`;
  }

  // ── Primitive coercions that JSON can't (or shouldn't) carry ────────────────
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return "[unserializable]";
  }

  // ── Strings (top-level / array elements) ────────────────────────────────────
  if (typeof value === "string") {
    return maskScalarString(value, emailLoggingAllowed);
  }

  // ── Arrays ──────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return "[depth limit]";
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const capped =
      value.length > MAX_BREADTH ? value.slice(0, MAX_BREADTH) : value;
    const out = capped.map((item) =>
      sanitizeValue(item, emailLoggingAllowed, depth + 1, seen),
    );
    seen.delete(value);
    if (value.length > MAX_BREADTH) {
      out.push(`[+${value.length - MAX_BREADTH} more]`);
    }
    return out;
  }

  // ── Dates → ISO string (safe, useful) ───────────────────────────────────────
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  }

  // ── Objects ─────────────────────────────────────────────────────────────────
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[depth limit]";
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    let kept = 0;

    for (const [key, val] of Object.entries(input)) {
      if (kept >= MAX_BREADTH) {
        result["[truncated]"] = true;
        break;
      }

      // Rule 1 — blocked key name: drop the key entirely
      if (isBlockedKey(key)) continue;

      // Rule 2 — Israeli ID number (9 digits): replace with presence flag.
      // (Object-only because it renames the key.)
      if (typeof val === "string" && ID_NUMBER_PATTERN.test(val.trim())) {
        result[`${key}_present`] = true;
        kept++;
        continue;
      }

      if (typeof val === "string") {
        result[key] = maskScalarString(val, emailLoggingAllowed);
      } else {
        result[key] = sanitizeValue(val, emailLoggingAllowed, depth + 1, seen);
      }
      kept++;
    }

    seen.delete(value);
    return result;
  }

  // ── Remaining primitives (number, boolean) ──────────────────────────────────
  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Recursively sanitize a metadata object before it is written to AuditLog.
 *
 * Rules applied at every nesting level:
 *   1. Blocked keys (BLOCKED_KEY_SUBSTRINGS match on normalized key) → dropped.
 *   2. String matching Israeli ID pattern (9 digits) → `[key]` dropped, `[key]_present = true` added.
 *   3. PAN (Luhn) → `****last4`; IL-IBAN → `[iban redacted]`.
 *   4. Phone → `***XXXX`; email → `[email redacted]` (unless emailLoggingAllowed).
 *   5. Long hex / high-entropy token → `[redacted …]`; over-length string → truncated.
 *   6. RevealableSecret → `"[secret]"`; binary blob → `[bytes len=N]`.
 *   7. Arrays / nested objects → recursed (with depth, breadth, and cycle caps).
 *
 * Always returns a NEW tree; never mutates the input.
 *
 * @param obj                 The raw metadata object from the caller.
 * @param emailLoggingAllowed When true, email-shaped strings are kept verbatim.
 * @returns A new object safe for storage in AuditLog.metadata.
 */
export function sanitizeMetadata(
  obj: Record<string, unknown>,
  emailLoggingAllowed: boolean = false,
): Record<string, unknown> {
  return sanitizeValue(obj, emailLoggingAllowed, 0, new WeakSet()) as Record<
    string,
    unknown
  >;
}
