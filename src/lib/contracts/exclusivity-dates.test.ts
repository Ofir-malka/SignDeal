/**
 * exclusivity-dates.test.ts
 *
 * The exclusivity period math is legal-document-facing: the inclusive
 * day-before convention (3 months from 01.08 ends 31.10) and the Hebrew
 * duration text shown to the broker must be deterministic and edge-safe
 * (month-end clamping, year rollover).
 */

import { describe, it, expect } from "vitest";
import {
  addMonthsInclusive,
  exclusivityDuration,
  durationTextHe,
  isWholeMonths,
  fromInputValue,
  toInputValue,
} from "./exclusivity-dates";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("addMonthsInclusive — inclusive day-before convention", () => {
  it("3 months from 01.08 ends 31.10 (the product example)", () => {
    expect(toInputValue(addMonthsInclusive(d(2026, 8, 1), 3))).toBe("2026-10-31");
  });

  it("1 month from 01.08 ends 31.08", () => {
    expect(toInputValue(addMonthsInclusive(d(2026, 8, 1), 1))).toBe("2026-08-31");
  });

  it("12 months from 01.08 ends 31.07 next year", () => {
    expect(toInputValue(addMonthsInclusive(d(2026, 8, 1), 12))).toBe("2027-07-31");
  });

  it("month-end clamp: 1 month from 31.01 ends 28.02 (no extra day-before)", () => {
    // 31 does not exist in February — clamp to the month's last day without
    // subtracting the extra day ("one month from 31.01" ends on Feb's last day).
    expect(toInputValue(addMonthsInclusive(d(2026, 1, 31), 1))).toBe("2026-02-28");
  });

  it("month-end clamp in a leap year: 1 month from 31.01.2024 ends 29.02.2024", () => {
    expect(toInputValue(addMonthsInclusive(d(2024, 1, 31), 1))).toBe("2024-02-29");
  });

  it("boundary: 1 month from 28.01 (day exists in February) ends 27.02", () => {
    // 28 exists in February, so the normal day-before convention applies.
    expect(toInputValue(addMonthsInclusive(d(2026, 1, 28), 1))).toBe("2026-02-27");
  });

  it("mid-month start: 1 month from 15.06 ends 14.07", () => {
    expect(toInputValue(addMonthsInclusive(d(2026, 6, 15), 1))).toBe("2026-07-14");
  });
});

describe("exclusivityDuration — whole months + leftover days (inclusive)", () => {
  it("01.08 → 31.10 is exactly 3 months", () => {
    expect(exclusivityDuration(d(2026, 8, 1), d(2026, 10, 31))).toEqual({ months: 3, days: 0 });
  });

  it("01.08 → 06.11 is 3 months and 6 days (the product example)", () => {
    expect(exclusivityDuration(d(2026, 8, 1), d(2026, 11, 6))).toEqual({ months: 3, days: 6 });
  });

  it("01.08 → 10.08 is 10 days (inclusive count, no whole month)", () => {
    expect(exclusivityDuration(d(2026, 8, 1), d(2026, 8, 10))).toEqual({ months: 0, days: 10 });
  });

  it("01.08 → 31.08 is exactly 1 month", () => {
    expect(exclusivityDuration(d(2026, 8, 1), d(2026, 8, 31))).toEqual({ months: 1, days: 0 });
  });

  it("crosses a year boundary: 01.11.2026 → 31.01.2027 is exactly 3 months", () => {
    expect(exclusivityDuration(d(2026, 11, 1), d(2027, 1, 31))).toEqual({ months: 3, days: 0 });
  });

  it("month-end clamp round-trip: 31.01 → 28.02 is exactly 1 month (no warning)", () => {
    // Consistent with addMonthsInclusive's clamp rule — a clamped month-end
    // period must register as whole months so the UI warning stays silent.
    expect(exclusivityDuration(d(2026, 1, 31), d(2026, 2, 28))).toEqual({ months: 1, days: 0 });
  });
});

describe("durationTextHe", () => {
  it("months + days", () => {
    expect(durationTextHe({ months: 3, days: 6 })).toBe("3 חודשים ו-6 ימים");
  });

  it("single month", () => {
    expect(durationTextHe({ months: 1, days: 0 })).toBe("חודש אחד");
  });

  it("months only (plural)", () => {
    expect(durationTextHe({ months: 6, days: 0 })).toBe("6 חודשים");
  });

  it("days only", () => {
    expect(durationTextHe({ months: 0, days: 10 })).toBe("10 ימים");
  });

  it("single day", () => {
    expect(durationTextHe({ months: 0, days: 1 })).toBe("יום אחד");
  });
});

describe("isWholeMonths", () => {
  it("true for exact whole months", () => {
    expect(isWholeMonths({ months: 3, days: 0 })).toBe(true);
  });

  it("false when leftover days exist", () => {
    expect(isWholeMonths({ months: 3, days: 6 })).toBe(false);
  });

  it("false for days-only periods", () => {
    expect(isWholeMonths({ months: 0, days: 10 })).toBe(false);
  });
});

describe("input-value round-trip", () => {
  it("parses and re-serializes YYYY-MM-DD", () => {
    const date = fromInputValue("2026-08-01");
    expect(date).not.toBeNull();
    expect(toInputValue(date!)).toBe("2026-08-01");
  });

  it("rejects malformed values", () => {
    expect(fromInputValue("01/08/2026")).toBeNull();
    expect(fromInputValue("")).toBeNull();
  });
});
