import { describe, it, expect } from "vitest";
import { parseCreatePaymentProcessResponse } from "./parse-response";

describe("parseCreatePaymentProcessResponse", () => {
  it("parses a success envelope", () => {
    const r = parseCreatePaymentProcessResponse({
      status: 1,
      err: "",
      data: { url: "https://pay.grow/abc", processId: "395235", processToken: "tok123" },
    });
    expect(r).toEqual({ ok: true, paymentUrl: "https://pay.grow/abc", processId: "395235", processToken: "tok123" });
  });

  it("accepts string status '1' and a numeric processId", () => {
    const r = parseCreatePaymentProcessResponse({ status: "1", data: { url: "https://x", processId: 1, processToken: null } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.processId).toBe("1");
      expect(r.processToken).toBeNull();
    }
  });

  it("fails when success has no url", () => {
    const r = parseCreatePaymentProcessResponse({ status: 1, data: {} });
    expect(r).toEqual({ ok: false, reason: "success status but no payment url in response" });
  });

  it("maps a logical error envelope with id + message", () => {
    const r = parseCreatePaymentProcessResponse({ status: 0, err: { id: 723, message: "apiKey שדה חובה" }, data: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errId).toBe(723);
      expect(r.reason).toContain("apiKey");
    }
  });

  it("fails on empty / non-object input", () => {
    expect(parseCreatePaymentProcessResponse(null).ok).toBe(false);
    expect(parseCreatePaymentProcessResponse("nope").ok).toBe(false);
  });
});
