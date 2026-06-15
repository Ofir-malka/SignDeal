import { describe, it, expect } from "vitest";
import {
  isValidIsraeliMobile,
  isValidBusinessNumber,
  digitsOnly,
  canContinue,
} from "./launch-validation";

describe("isValidIsraeliMobile", () => {
  it("accepts a 10-digit 05 number", () => {
    expect(isValidIsraeliMobile("0501234567")).toBe(true);
    expect(isValidIsraeliMobile("0521112222")).toBe(true);
  });
  it("rejects the wrong length", () => {
    expect(isValidIsraeliMobile("050123456")).toBe(false); // 9 digits
    expect(isValidIsraeliMobile("05012345678")).toBe(false); // 11 digits
  });
  it("rejects a non-05 prefix", () => {
    expect(isValidIsraeliMobile("0601234567")).toBe(false);
    expect(isValidIsraeliMobile("1501234567")).toBe(false);
  });
  it("rejects separators, letters, and empty", () => {
    expect(isValidIsraeliMobile("050-123-4567")).toBe(false);
    expect(isValidIsraeliMobile("050 123 4567")).toBe(false);
    expect(isValidIsraeliMobile("05a1234567")).toBe(false);
    expect(isValidIsraeliMobile("")).toBe(false);
  });
});

describe("isValidBusinessNumber", () => {
  it("accepts 8 or 9 digits", () => {
    expect(isValidBusinessNumber("12345678")).toBe(true);
    expect(isValidBusinessNumber("512345678")).toBe(true);
  });
  it("rejects too short / too long", () => {
    expect(isValidBusinessNumber("1234567")).toBe(false); // 7
    expect(isValidBusinessNumber("1234567890")).toBe(false); // 10
  });
  it("rejects letters, spaces, and empty", () => {
    expect(isValidBusinessNumber("12a45678")).toBe(false);
    expect(isValidBusinessNumber(" 12345678 ")).toBe(false);
    expect(isValidBusinessNumber("")).toBe(false);
  });
});

describe("digitsOnly", () => {
  it("strips everything but digits", () => {
    expect(digitsOnly("050-123-4567")).toBe("0501234567");
    expect(digitsOnly("+972 50 123")).toBe("97250123");
    expect(digitsOnly("abc")).toBe("");
  });
});

describe("canContinue", () => {
  const ok = {
    phone: "0501234567",
    businessNumber: "512345678",
    consent: true,
    submitting: false,
  };
  it("is true only when all fields valid, consent given, not submitting", () => {
    expect(canContinue(ok)).toBe(true);
  });
  it("is false when phone is invalid", () => {
    expect(canContinue({ ...ok, phone: "0601234567" })).toBe(false);
  });
  it("is false when businessNumber is invalid", () => {
    expect(canContinue({ ...ok, businessNumber: "123" })).toBe(false);
  });
  it("is false without consent", () => {
    expect(canContinue({ ...ok, consent: false })).toBe(false);
  });
  it("is false while submitting", () => {
    expect(canContinue({ ...ok, submitting: true })).toBe(false);
  });
});
