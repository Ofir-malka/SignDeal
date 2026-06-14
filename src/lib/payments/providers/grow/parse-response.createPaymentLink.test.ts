import { describe, it, expect } from "vitest";
import { parseCreatePaymentLinkResponse } from "./parse-response";

describe("parseCreatePaymentLinkResponse", () => {
  it("maps a success envelope onto the shared result shape", () => {
    const r = parseCreatePaymentLinkResponse({
      status: 1,
      err: {},
      data: {
        url: "https://sandbox.grow.link/abc123-MzcxMzI",
        paymentLinkProcessId: "37132",
        paymentLinkProcessToken: "tok_abc",
      },
    });
    expect(r).toEqual({
      ok: true,
      paymentUrl: "https://sandbox.grow.link/abc123-MzcxMzI",
      processId: "37132",
      processToken: "tok_abc",
    });
  });

  it("accepts a numeric paymentLinkProcessId (coerced to string)", () => {
    const r = parseCreatePaymentLinkResponse({
      status: "1",
      err: "",
      data: { url: "https://sandbox.grow.link/x", paymentLinkProcessId: 37132 },
    });
    expect(r).toMatchObject({ ok: true, processId: "37132", processToken: null });
  });

  it("treats success without a url as a failure", () => {
    const r = parseCreatePaymentLinkResponse({ status: 1, err: {}, data: {} });
    expect(r.ok).toBe(false);
  });

  it("maps an error envelope (e.g. 784/852/701) to ok:false with errId", () => {
    const r = parseCreatePaymentLinkResponse({
      status: 0,
      err: { id: 784, message: "תבנית העמוד לא תקינה - יש להגדיר כsdk-ארנק" },
      data: {},
    });
    expect(r).toMatchObject({ ok: false, errId: 784 });
  });

  it("handles empty / non-object input", () => {
    expect(parseCreatePaymentLinkResponse(null).ok).toBe(false);
    expect(parseCreatePaymentLinkResponse("nope").ok).toBe(false);
  });
});
