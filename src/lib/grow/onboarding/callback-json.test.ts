import { describe, it, expect } from "vitest";
import { parseOnboardingCallback } from "./callback-json";

const NESTED = JSON.stringify({
  err: null,
  data: {
    name: "Test Broker",
    phone: "0500000000",
    api_key: "84dhsecret",
    user_id: "beasuser123",
    package_id: "1997",
    package_name: "Pro",
    tracking_code: "TRK-9",
    business_title: "Test LTD",
    tracking_status: { id: "3", message: "העסק הוקם בהצלחה" },
  },
  status: "1",
});

describe("parseOnboardingCallback", () => {
  it("rejects a non-JSON content-type (locked to application/json)", () => {
    const r = parseOnboardingCallback(NESTED, "application/x-www-form-urlencoded");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported_content_type");
  });

  it("accepts application/json with a charset param", () => {
    const r = parseOnboardingCallback(NESTED, "application/json; charset=utf-8");
    expect(r.ok).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const r = parseOnboardingCallback("{not json", "application/json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_json");
  });

  it("maps the nested data shape to the canonical update", () => {
    const r = parseOnboardingCallback(NESTED, "application/json");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update.growUserId).toBe("beasuser123");
    expect(r.update.trackingCode).toBe("TRK-9");
    expect(r.update.packageId).toBe("1997");
    expect(r.update.packageName).toBe("Pro");
    expect(r.update.businessTitle).toBe("Test LTD");
    expect(r.update.statusRaw).toBe("1");
    expect(r.update.trackingStatus).toEqual({ id: "3", message: "העסק הוקם בהצלחה" });
    expect(r.update.apiKey).toBe("84dhsecret");
  });

  it("leaves businessTitle/packageName null when the callback omits them", () => {
    const minimal = JSON.stringify({ data: { user_id: "u2", tracking_code: "T2" }, status: "1" });
    const r = parseOnboardingCallback(minimal, "application/json");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update.businessTitle).toBeNull();
    expect(r.update.packageName).toBeNull();
    expect(r.update.growUserId).toBe("u2"); // existing fields still parse
  });

  it("supports a flat (un-nested) variant", () => {
    const flat = JSON.stringify({ user_id: "u1", status: "1", tracking_code: "T1" });
    const r = parseOnboardingCallback(flat, "application/json");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update.growUserId).toBe("u1");
    expect(r.update.trackingCode).toBe("T1");
    expect(r.update.statusRaw).toBe("1");
  });

  it("coerces numeric scalars to strings", () => {
    const numeric = JSON.stringify({ data: { user_id: 12345, status: 1 }, status: 1 });
    const r = parseOnboardingCallback(numeric, "application/json");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update.growUserId).toBe("12345");
    expect(r.update.statusRaw).toBe("1");
  });
});
