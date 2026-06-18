import { describe, it, expect } from "vitest";
import { parseTokenCheckoutResponse, findSavedToken, parseTokenChargeResponse } from "./parse-response";

describe("parseTokenCheckoutResponse", () => {
  it("ok → url + process handles", () => {
    const r = parseTokenCheckoutResponse({ status: "1", data: { url: "https://x", processId: "p1", processToken: "t1" } });
    expect(r).toEqual({ ok: true, url: "https://x", processId: "p1", processToken: "t1" });
  });
  it("grow error → reason + errId", () => {
    const r = parseTokenCheckoutResponse({ status: "0", err: { id: 54, message: "missing paymentType" } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errId).toBe(54); expect(r.reason).toBe("missing paymentType"); }
  });
  it("missing url → failure", () => {
    expect(parseTokenCheckoutResponse({ status: "1", data: { processId: "p1" } }).ok).toBe(false);
  });
});

describe("findSavedToken", () => {
  it("extracts nested token-setup fields (statusCode 11)", () => {
    const data = {
      transactions: [{
        statusCode: "11",
        cardToken: "x".repeat(40),
        cardSuffix: "4580",
        customFields: { cField1: "saas_token_setup:sd-1" },
        processId: "p1",
      }],
    };
    const s = findSavedToken(data);
    expect(s).not.toBeNull();
    expect(s!.statusCode).toBe("11");
    expect(s!.cardToken).toHaveLength(40);
    expect(s!.cardSuffix).toBe("4580");
    expect(s!.cField1).toBe("saas_token_setup:sd-1");
    expect(s!.processId).toBe("p1");
  });
  it("returns null when neither statusCode nor cardToken is present", () => {
    expect(findSavedToken({ foo: "bar" })).toBeNull();
  });
});

describe("parseTokenChargeResponse (createTransactionWithToken — server→Grow recurring charge)", () => {
  it("paid → status 1 + statusCode 2 + transaction/approval ids", () => {
    const r = parseTokenChargeResponse({ status: "1", data: { statusCode: "2", transactionId: "tx99", asmachta: "appr1" } });
    expect(r).toEqual({ status: "1", statusCode: "2", errId: null, transactionId: "tx99", approvalCode: "appr1" });
  });
  it("request/config error → errId surfaced, statusCode null", () => {
    const r = parseTokenChargeResponse({ status: "0", err: { id: 54, message: "missing paymentType" } });
    expect(r.status).toBe("0");
    expect(r.errId).toBe(54);
    expect(r.statusCode).toBeNull();
  });
  it("missing fields → all nulls (no throw)", () => {
    expect(parseTokenChargeResponse({})).toEqual({
      status: null, statusCode: null, errId: null, transactionId: null, approvalCode: null,
    });
  });
});
