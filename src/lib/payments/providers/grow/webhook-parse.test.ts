import { describe, it, expect } from "vitest";
import { extractCallbackTrigger, findPaidTransaction } from "./webhook-parse";

describe("extractCallbackTrigger", () => {
  it("reads the flat bracket keys from the form callback", () => {
    const form = {
      status: "1",
      "data[customFields][cField1]": "cmqds8pg2000b04kyj0zp7gbd",
      "data[paymentLinkProcessId]": "37013",
      "data[transactionId]": "515594",
      "data[statusCode]": "2",
    };
    expect(extractCallbackTrigger(form)).toEqual({
      cField1: "cmqds8pg2000b04kyj0zp7gbd",
      paymentLinkProcessId: "37013",
      transactionId: "515594",
    });
  });

  it("returns nulls when keys are absent or blank", () => {
    expect(extractCallbackTrigger({})).toEqual({ cField1: null, paymentLinkProcessId: null, transactionId: null });
    expect(extractCallbackTrigger({ "data[transactionId]": "  " }).transactionId).toBeNull();
  });
});

// Mirrors the live-verified getPaymentLinkInfo `data` shape.
function infoData(overrides: Record<string, unknown> = {}) {
  return {
    paymentLinkProcessId: "37013",
    paymentLinkType: "2",
    paymentLinkTransactions: [
      {
        processId: "721540",
        processToken: "ptok_secret",
        customField: { cField1: "cmqds8pg2000b04kyj0zp7gbd" },
        transactions: [
          {
            status: "שולם",
            statusCode: "2",
            sum: "2",
            transactionId: "515594",
            transactionToken: "ttok_secret",
            asmachta: "127387310",
            cardSuffix: "1943",
            paymentLinkProcessId: "37013",
            ...overrides,
          },
        ],
      },
    ],
  };
}

describe("findPaidTransaction", () => {
  it("extracts the PAID transaction (statusCode 2) with authoritative fields", () => {
    const txn = findPaidTransaction(infoData(), "cmqds8pg2000b04kyj0zp7gbd");
    expect(txn).toEqual({
      paid: true,
      statusCode: "2",
      cField1: "cmqds8pg2000b04kyj0zp7gbd",
      sumShekels: "2",
      paymentLinkProcessId: "37013",
      transactionId: "515594",
      transactionToken: "ttok_secret",
      asmachta: "127387310",
      cardSuffix: "1943",
      processId: "721540",
      processToken: "ptok_secret",
    });
  });

  it("returns null when no transaction has statusCode 2", () => {
    expect(findPaidTransaction(infoData({ statusCode: "1" }), "cmqds8pg2000b04kyj0zp7gbd")).toBeNull();
  });

  it("skips entries whose cField1 belongs to a different payment", () => {
    expect(findPaidTransaction(infoData(), "some-other-payment-id")).toBeNull();
  });

  it("matches regardless of cField1 when none is expected (fallback path)", () => {
    expect(findPaidTransaction(infoData(), null)?.paid).toBe(true);
  });

  it("handles empty / malformed data", () => {
    expect(findPaidTransaction(null, "x")).toBeNull();
    expect(findPaidTransaction({ paymentLinkTransactions: [] }, "x")).toBeNull();
  });
});
