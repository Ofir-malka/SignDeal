/**
 * Lightweight validation helpers used across API routes.
 *
 * All functions return a tagged-union Result<T>:
 *   { ok: true;  value: T }
 *   { ok: false; error: string }   ← Hebrew error message, safe to return to client
 *
 * Collect results and call firstError() / allErrors() to build a 400 response.
 *
 * Usage:
 *   const price = parsePositiveInt(body.propertyPrice, "מחיר הנכס");
 *   const deal  = parseEnum(body.dealType, DEAL_TYPES, "סוג העסקה");
 *   const err   = firstError(price, deal);
 *   if (err) return NextResponse.json({ error: err }, { status: 400 });
 *   // price.value and deal.value are now safely typed numbers/strings
 */

export type Ok<T>     = { ok: true;  value: T };
export type Err       = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

const ok  = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = (error: string): Err  => ({ ok: false, error });

// ── Numeric validators ────────────────────────────────────────────────────────

/**
 * Required positive integer (≥ 1). Rejects: missing, NaN, non-integer,
 * zero, negative, Infinity. Typical use: prices in agorot.
 *
 * @param maxVal  Upper bound guard against absurd values (default 2 000 000 000)
 */
export function parsePositiveInt(
  raw:    unknown,
  label:  string,
  maxVal  = 2_000_000_000,
): Result<number> {
  if (raw === null || raw === undefined || raw === "")
    return err(`${label} הוא שדה חובה`);
  const n = Number(raw);
  if (!Number.isFinite(n))    return err(`${label} אינו מספר תקין`);
  if (!Number.isInteger(n))   return err(`${label} חייב להיות מספר שלם`);
  if (n < 1)                  return err(`${label} חייב להיות גדול מ-0`);
  if (n > maxVal)             return err(`${label} גדול מהמותר`);
  return ok(n);
}

/**
 * Required non-negative integer (≥ 0). Same as above but allows zero.
 * Typical use: commission (can be 0).
 */
export function parseNonNegativeInt(
  raw:    unknown,
  label:  string,
  maxVal  = 2_000_000_000,
): Result<number> {
  if (raw === null || raw === undefined || raw === "")
    return err(`${label} הוא שדה חובה`);
  const n = Number(raw);
  if (!Number.isFinite(n))  return err(`${label} אינו מספר תקין`);
  if (!Number.isInteger(n)) return err(`${label} חייב להיות מספר שלם`);
  if (n < 0)                return err(`${label} לא יכול להיות שלילי`);
  if (n > maxVal)           return err(`${label} גדול מהמותר`);
  return ok(n);
}

/**
 * Optional positive float (> 0). Returns null when raw is null/undefined/"".
 * Typical use: rooms (3, 3.5), sizeSqm.
 */
export function parseOptionalPositiveFloat(
  raw:    unknown,
  label:  string,
  maxVal  = 1_000_000,
): Result<number | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const n = Number(raw);
  if (!Number.isFinite(n)) return err(`${label} אינו מספר תקין`);
  if (n <= 0)              return err(`${label} חייב להיות גדול מ-0`);
  if (n > maxVal)          return err(`${label} גדול מהמותר`);
  return ok(n);
}

/**
 * Optional integer. Allows negative (e.g. basement floor = -1).
 * Returns null when raw is null/undefined/"".
 */
export function parseOptionalInt(
  raw:    unknown,
  label:  string,
  minVal  = -999,
  maxVal  = 999,
): Result<number | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const n = Number(raw);
  if (!Number.isFinite(n))  return err(`${label} אינו מספר תקין`);
  if (!Number.isInteger(n)) return err(`${label} חייב להיות מספר שלם`);
  if (n < minVal)           return err(`${label} קטן מהמותר`);
  if (n > maxVal)           return err(`${label} גדול מהמותר`);
  return ok(n);
}

/**
 * Optional positive integer (≥ 1). Returns null when raw is null/undefined/"".
 * Typical use: askingPrice in agorot.
 */
export function parseOptionalPositiveInt(
  raw:    unknown,
  label:  string,
  maxVal  = 2_000_000_000,
): Result<number | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const n = Number(raw);
  if (!Number.isFinite(n))  return err(`${label} אינו מספר תקין`);
  if (!Number.isInteger(n)) return err(`${label} חייב להיות מספר שלם`);
  if (n < 1)                return err(`${label} חייב להיות גדול מ-0`);
  if (n > maxVal)           return err(`${label} גדול מהמותר`);
  return ok(n);
}

// ── Enum validator ────────────────────────────────────────────────────────────

/**
 * Required enum — value must be one of the allowed strings.
 * Returns a typed narrow value so TypeScript knows which union member it is.
 */
export function parseEnum<T extends string>(
  raw:     unknown,
  allowed: readonly T[],
  label:   string,
): Result<T> {
  if (raw === null || raw === undefined || raw === "")
    return err(`${label} הוא שדה חובה`);
  if (typeof raw !== "string")
    return err(`${label} אינו תקין`);
  if (!(allowed as readonly string[]).includes(raw))
    return err(`${label} אינו ערך מותר (${allowed.join(", ")})`);
  return ok(raw as T);
}

/**
 * Optional enum — returns null when raw is null/undefined/"".
 */
export function parseOptionalEnum<T extends string>(
  raw:     unknown,
  allowed: readonly T[],
  label:   string,
): Result<T | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  if (typeof raw !== "string")
    return err(`${label} אינו תקין`);
  if (!(allowed as readonly string[]).includes(raw))
    return err(`${label} אינו ערך מותר (${allowed.join(", ")})`);
  return ok(raw as T);
}

// ── Date validator ────────────────────────────────────────────────────────────

/**
 * Optional date. Returns null when raw is null/undefined/"".
 * Rejects non-parseable strings ("banana", "0000-00-00", etc.).
 */
export function parseOptionalDate(raw: unknown, label: string): Result<Date | null> {
  if (raw === null || raw === undefined || raw === "") return ok(null);
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) return err(`${label} אינו תאריך תקין`);
  // Sanity check: reject dates absurdly far in future or pre-1900
  const year = d.getFullYear();
  if (year < 1900 || year > 2200) return err(`${label} מחוץ לטווח תקין`);
  return ok(d);
}

/**
 * Required date — same as above but rejects missing values.
 */
export function parseDate(raw: unknown, label: string): Result<Date> {
  if (raw === null || raw === undefined || raw === "")
    return err(`${label} הוא שדה חובה`);
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) return err(`${label} אינו תאריך תקין`);
  const year = d.getFullYear();
  if (year < 1900 || year > 2200) return err(`${label} מחוץ לטווח תקין`);
  return ok(d);
}

// ── Error collection helpers ──────────────────────────────────────────────────

/**
 * Return the first error message from a list of Results, or null when all pass.
 * Use when you want to fail-fast on the first bad field.
 */
export function firstError(...results: Result<unknown>[]): string | null {
  for (const r of results) {
    if (!r.ok) return r.error;
  }
  return null;
}

/**
 * Collect ALL error messages from a list of Results.
 * Returns null when every result is ok.
 */
export function allErrors(...results: Result<unknown>[]): string[] | null {
  const errors = results.filter((r): r is Err => !r.ok).map((r) => r.error);
  return errors.length > 0 ? errors : null;
}
