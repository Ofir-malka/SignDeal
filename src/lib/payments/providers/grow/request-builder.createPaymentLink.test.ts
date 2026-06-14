import { describe, it, expect } from "vitest";
import { buildCreatePaymentLinkFields } from "./request-builder";
import type { BuildCreatePaymentLinkArgs } from "./types";

function base(partial: Partial<BuildCreatePaymentLinkArgs> = {}): BuildCreatePaymentLinkArgs {
  return {
    userId: "broker-user-1",
    apiKey: "FAKE_BROKER_KEY",
    pageCode: "12796f74fc4f",
    sumShekels: "11000.00",
    title: "עמלת תיווך — הרצל 1, תל אביב",
    productName: "עמלת תיווך — הרצל 1, תל אביב",
    fullName: "ישראל ישראלי",
    phone: "0501234567",
    ...partial,
  };
}

describe("buildCreatePaymentLinkFields", () => {
  it("emits the core CreatePaymentLink body fields", () => {
    const f = buildCreatePaymentLinkFields(base());
    expect(f.userId).toBe("broker-user-1");
    expect(f.apiKey).toBe("FAKE_BROKER_KEY"); // broker key in the BODY
    expect(f.pageCode).toBe("12796f74fc4f");
    expect(f.paymentLinkType).toBe("2");
    expect(f.isActive).toBe("1");
    expect(f.chargeType).toBe("1");
    expect(f["paymentTypes[0][type]"]).toBe("payments");
  });

  it("sends commission-only price with vatType=1 (no VAT/fees added)", () => {
    const f = buildCreatePaymentLinkFields(base());
    expect(f["products[data][0][price]"]).toBe("11000.00");
    expect(f["products[data][0][vatType]"]).toBe("1");
  });

  it("allows installments (paymentsMaxPaymentNum=12), NOT a fixed single payment", () => {
    const f = buildCreatePaymentLinkFields(base());
    expect(f["paymentTypes[0][payments][paymentsMaxPaymentNum]"]).toBe("12");
    expect(f["paymentTypes[0][payments][paymentsPaymentNum]"]).toBeUndefined();
  });

  it("includes the validated transactionType set (6 methods)", () => {
    const f = buildCreatePaymentLinkFields(base());
    expect(f["transactionType[0]"]).toBe("1");
    expect(f["transactionType[1]"]).toBe("6");
    expect(f["transactionType[2]"]).toBe("13");
    expect(f["transactionType[3]"]).toBe("14");
    expect(f["transactionType[4]"]).toBe("15");
    expect(f["transactionType[5]"]).toBe("5");
  });

  it("never places the product x-api-key in the body", () => {
    const f = buildCreatePaymentLinkFields(base());
    expect(f["x-api-key"]).toBeUndefined();
  });

  it("omits email unless provided", () => {
    expect(buildCreatePaymentLinkFields(base())["pageFieldSettings[email][value]"]).toBeUndefined();
    const withEmail = buildCreatePaymentLinkFields(base({ email: "client@example.com" }));
    expect(withEmail["pageFieldSettings[email][value]"]).toBe("client@example.com");
  });

  it("is P3-ready: notifyUrl omitted by default, included (trimmed) when provided", () => {
    expect(buildCreatePaymentLinkFields(base()).notifyUrl).toBeUndefined();
    const withNotify = buildCreatePaymentLinkFields(
      base({ notifyUrl: "https://www.signdeal.co.il/api/grow/webhook" }),
    );
    expect(withNotify.notifyUrl).toBe("https://www.signdeal.co.il/api/grow/webhook");
  });
});
