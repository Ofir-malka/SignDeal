// ── Exclusivity period date helpers ───────────────────────────────────────────
//
// Pure date math for the owner-exclusive exclusivity period UI
// (NewContractForm). All functions work on LOCAL calendar dates (year/month/day
// components) so browser-timezone offsets never shift the chosen day.
//
// Convention (product-approved): the period end is INCLUSIVE, day-before —
// "3 months from 01.08" ends on 31.10, not 01.11.
//
// Only the resulting start/end dates are persisted (Contract.exclusivityStartsAt
// / exclusivityEndsAt); duration mode/text are UI-derived and never stored.

/** Days in the month containing (year, monthIndex). monthIndex is 0-based. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = atMidnight(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Whole-day difference a − b (both taken at local midnight). */
function diffDays(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((atMidnight(a).getTime() - atMidnight(b).getTime()) / MS_PER_DAY);
}

/**
 * Inclusive period end for `months` whole months starting at `start`.
 *
 * Normal case — the start day exists in the target month:
 *   start + N months, minus one day (inclusive day-before convention).
 *   01.08.2026 + 3  → 31.10.2026
 *
 * Month-end case — the start day does NOT exist in the target month:
 *   clamp to the target month's last day WITHOUT the extra day-before
 *   subtraction ("one month from 31.01" intuitively ends on the last day
 *   of February, not the day before it).
 *   31.01.2026 + 1  → 28.02.2026
 *   31.01.2024 + 1  → 29.02.2024 (leap year)
 */
export function addMonthsInclusive(start: Date, months: number): Date {
  const y = start.getFullYear();
  const targetMonth = start.getMonth() + months;
  const lastDay = daysInMonth(y, targetMonth);
  if (start.getDate() > lastDay) {
    return new Date(y, targetMonth, lastDay);
  }
  return addDays(new Date(y, targetMonth, start.getDate()), -1);
}

/**
 * Decomposes the INCLUSIVE period [start, end] into whole months + leftover days
 * under the day-before convention. Whole months ⇔ days === 0.
 *   01.08 → 31.10  ⇒ { months: 3, days: 0 }
 *   01.08 → 06.11  ⇒ { months: 3, days: 6 }
 *   01.08 → 10.08  ⇒ { months: 0, days: 10 }
 */
export function exclusivityDuration(start: Date, end: Date): { months: number; days: number } {
  const endMid = atMidnight(end).getTime();
  let months = 0;
  // 1200 = hard upper bound (100 years) — protects against bad inputs.
  while (months < 1200 && addMonthsInclusive(start, months + 1).getTime() <= endMid) {
    months++;
  }
  const monthsEnd = months === 0 ? addDays(start, -1) : addMonthsInclusive(start, months);
  return { months, days: diffDays(end, monthsEnd) };
}

/** "3 חודשים ו-6 ימים" / "חודש אחד" / "10 ימים" — UI display only. */
export function durationTextHe(dur: { months: number; days: number }): string {
  const monthsText = dur.months === 1 ? "חודש אחד" : `${dur.months} חודשים`;
  const daysText   = dur.days === 1 ? "יום אחד" : `${dur.days} ימים`;
  if (dur.months > 0 && dur.days > 0) return `${monthsText} ו-${daysText}`;
  if (dur.months > 0) return monthsText;
  return daysText;
}

/** True when the inclusive period is an exact number of whole months (≥ 1). */
export function isWholeMonths(dur: { months: number; days: number }): boolean {
  return dur.months > 0 && dur.days === 0;
}

/** "YYYY-MM-DD" (for <input type="date">) → local-midnight Date; null if invalid. */
export function fromInputValue(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Local Date → "YYYY-MM-DD" (for <input type="date"> and the API payload). */
export function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
