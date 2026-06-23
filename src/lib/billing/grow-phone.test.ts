import { describe, it, expect } from "vitest";
import { GROW_PHONE_RE, normalizeGrowPhone, isValidGrowPhone } from "./grow-phone";

describe("GROW_PHONE_RE", () => {
  it("is the Israeli local format: leading 0 + 8–9 more digits", () => {
    expect(GROW_PHONE_RE.source).toBe("^0\\d{8,9}$");
  });
});

describe("normalizeGrowPhone", () => {
  it("strips spaces, dashes, and parens", () => {
    expect(normalizeGrowPhone("050-123-4567")).toBe("0501234567");
    expect(normalizeGrowPhone(" 050 123 4567 ")).toBe("0501234567");
    expect(normalizeGrowPhone("(03) 123-4567")).toBe("031234567");
  });
  it("strips a leading + / country code to bare digits", () => {
    expect(normalizeGrowPhone("+972501234567")).toBe("972501234567");
  });
  it("returns empty string for null / undefined / empty", () => {
    expect(normalizeGrowPhone(null)).toBe("");
    expect(normalizeGrowPhone(undefined)).toBe("");
    expect(normalizeGrowPhone("")).toBe("");
    expect(normalizeGrowPhone("abc")).toBe("");
  });
});

describe("isValidGrowPhone", () => {
  it("accepts valid Israeli local numbers (mobile 10-digit, landline 9-digit)", () => {
    expect(isValidGrowPhone("0501234567")).toBe(true);   // mobile, 0 + 9
    expect(isValidGrowPhone("031234567")).toBe(true);    // landline, 0 + 8
    expect(isValidGrowPhone("0312345678")).toBe(true);   // 0 + 9
  });
  it("accepts numbers that are valid only after normalization", () => {
    expect(isValidGrowPhone("050-123-4567")).toBe(true);
    expect(isValidGrowPhone(" 0501234567 ")).toBe(true);
    expect(isValidGrowPhone("(03) 123-4567")).toBe(true);
  });
  it("rejects null / undefined / empty (the card-update 500 trigger)", () => {
    expect(isValidGrowPhone(null)).toBe(false);
    expect(isValidGrowPhone(undefined)).toBe(false);
    expect(isValidGrowPhone("")).toBe(false);
  });
  it("rejects country-code / non-local forms (policy requires local 0...)", () => {
    expect(isValidGrowPhone("+972501234567")).toBe(false); // → 972501234567, no leading 0
    expect(isValidGrowPhone("972501234567")).toBe(false);
    expect(isValidGrowPhone("501234567")).toBe(false);      // missing leading 0
  });
  it("rejects too-short / too-long / non-numeric", () => {
    expect(isValidGrowPhone("12345")).toBe(false);
    expect(isValidGrowPhone("0123456")).toBe(false);        // 0 + 6 = too short
    expect(isValidGrowPhone("01234567")).toBe(false);       // 0 + 7 = too short
    expect(isValidGrowPhone("05012345678")).toBe(false);    // 0 + 10 = too long
    expect(isValidGrowPhone("abcd")).toBe(false);
  });
});
