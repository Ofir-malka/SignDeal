import { describe, it, expect } from "vitest";
import { parsePaymentLinkInfoResponse } from "./parse-response";

describe("parsePaymentLinkInfoResponse", () => {
  it("returns the data object on success (status 1)", () => {
    const r = parsePaymentLinkInfoResponse({
      status: 1,
      err: "",
      data: { paymentLinkProcessId: "37013", paymentLinkTransactions: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.paymentLinkProcessId).toBe("37013");
  });

  it("accepts string status '1'", () => {
    const r = parsePaymentLinkInfoResponse({ status: "1", err: "", data: { x: 1 } });
    expect(r.ok).toBe(true);
  });

  it("fails when success but no data", () => {
    expect(parsePaymentLinkInfoResponse({ status: 1, err: "", data: "" }).ok).toBe(false);
  });

  it("maps an error envelope to ok:false with errId", () => {
    const r = parsePaymentLinkInfoResponse({ status: 0, err: { id: 716, message: "invalid" }, data: "" });
    expect(r).toMatchObject({ ok: false, errId: 716 });
  });

  it("handles empty / non-object input", () => {
    expect(parsePaymentLinkInfoResponse(null).ok).toBe(false);
  });
});
