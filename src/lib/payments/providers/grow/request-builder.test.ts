import { describe, it, expect } from "vitest";
import { buildCreatePaymentProcessFields, agorotToShekels } from "./request-builder";
import type { BuildCreatePaymentProcessArgs } from "./types";

function base(partial: Partial<BuildCreatePaymentProcessArgs> = {}): BuildCreatePaymentProcessArgs {
  return {
    pageCode: "12796f74fc4f",
    userId: "broker-user-1",
    apiKey: "FAKE_BROKER_KEY",
    sumShekels: "269.00",
    description: "עמלת תיווך — הרצל 1, תל אביב",
    successUrl: "https://app.example/pay/complete?contractId=c1&provider=grow",
    cancelUrl: "https://app.example/pay/complete?contractId=c1&status=cancel",
    fullName: "ישראל ישראלי",
    phone: "0501234567",
    paymentId: "pay_123",
    ...partial,
  };
}

describe("agorotToShekels", () => {
  it("converts agorot to a 2-dp shekel string", () => {
    expect(agorotToShekels(26900)).toBe("269.00");
    expect(agorotToShekels(1)).toBe("0.01");
    expect(agorotToShekels(0)).toBe("0.00");
  });
});

describe("buildCreatePaymentProcessFields", () => {
  it("includes the required Rail B fields + cField1=paymentId", () => {
    const f = buildCreatePaymentProcessFields(base());
    expect(f.pageCode).toBe("12796f74fc4f");
    expect(f.userId).toBe("broker-user-1");
    expect(f.apiKey).toBe("FAKE_BROKER_KEY");
    expect(f.sum).toBe("269.00");
    expect(f["pageField[fullName]"]).toBe("ישראל ישראלי");
    expect(f["pageField[phone]"]).toBe("0501234567");
    expect(f.cField1).toBe("pay_123");
    expect(f.successUrl).toContain("provider=grow");
  });

  it("omits email/companyCommission/notifyUrl/transactionUniqueIdentifier when not provided", () => {
    const f = buildCreatePaymentProcessFields(base());
    expect(f["pageField[email]"]).toBeUndefined();
    expect(f.companyCommission).toBeUndefined();
    expect(f.notifyUrl).toBeUndefined();
    expect(f.transactionUniqueIdentifier).toBeUndefined();
  });

  it("includes optional fields when provided", () => {
    const f = buildCreatePaymentProcessFields(
      base({
        email: "client@example.com",
        companyCommission: "2.5",
        notifyUrl: "https://app.example/api/grow/webhook",
        transactionUniqueIdentifier: "pay_123",
      }),
    );
    expect(f["pageField[email]"]).toBe("client@example.com");
    expect(f.companyCommission).toBe("2.5");
    expect(f.notifyUrl).toBe("https://app.example/api/grow/webhook");
    expect(f.transactionUniqueIdentifier).toBe("pay_123");
  });

  it("keeps cField1 (correlation) distinct from transactionUniqueIdentifier (dedup); never sends transactionGroupIdentifier", () => {
    const f = buildCreatePaymentProcessFields(base({ transactionUniqueIdentifier: "pay_123" }));
    expect(f.cField1).toBe("pay_123");
    expect(f.transactionUniqueIdentifier).toBe("pay_123");
    expect(f.transactionGroupIdentifier).toBeUndefined();
  });
});
