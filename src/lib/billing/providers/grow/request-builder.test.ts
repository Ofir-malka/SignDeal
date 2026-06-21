import { describe, it, expect } from "vitest";
import {
  buildTokenSetupFields,
  buildProcessInfoFields,
  agorotToShekels,
  tokenSetupCField1,
  growTransactionUid,
  tokenChargeCField1,
  buildTokenChargeFields,
} from "./request-builder";

const base = {
  pageCode: "pc", userId: "u", apiKey: "k", order: "sd-1", sumShekels: "39.00",
  description: "d", successUrl: "s", cancelUrl: "c", fullName: "n", email: "e@x.com",
};

describe("buildTokenSetupFields", () => {
  it("is a token-only (Get Token Only) request with no notifyUrl", () => {
    const f = buildTokenSetupFields(base);
    expect(f.chargeType).toBe("3");
    expect(f.saveCardToken).toBe("1");
    expect(f.cField1).toBe("saas_token_setup:sd-1");
    expect(f["pageField[email]"]).toBe("e@x.com");
    expect(f.notifyUrl).toBeUndefined();
    expect(f["pageField[phone]"]).toBeUndefined();
  });
  it("includes phone only when provided", () => {
    expect(buildTokenSetupFields({ ...base, phone: "0500000000" })["pageField[phone]"]).toBe("0500000000");
  });
  it("sends pageField[fullName] and pageField[phone] with the given values", () => {
    const f = buildTokenSetupFields({ ...base, fullName: "Broker Name", phone: "0501234567" });
    expect(f["pageField[fullName]"]).toBe("Broker Name");
    expect(f["pageField[phone]"]).toBe("0501234567");
  });
});

describe("buildProcessInfoFields", () => {
  it("sends exactly the five verify fields", () => {
    expect(buildProcessInfoFields({ pageCode: "pc", userId: "u", apiKey: "k", processId: "pid", processToken: "ptok" }))
      .toEqual({ pageCode: "pc", userId: "u", apiKey: "k", processId: "pid", processToken: "ptok" });
  });
});

describe("helpers", () => {
  it("agorotToShekels", () => {
    expect(agorotToShekels(3900)).toBe("39.00");
    expect(agorotToShekels(11000)).toBe("110.00");
  });
  it("tokenSetupCField1", () => {
    expect(tokenSetupCField1("sd-x")).toBe("saas_token_setup:sd-x");
  });
});

describe("buildTokenChargeFields (createTransactionWithToken — server→Grow recurring charge)", () => {
  const charge = {
    pageCode: "pc", userId: "u", apiKey: "k", cardToken: "x".repeat(40),
    sumShekels: "39.00", description: "d", cField1: "saas_charge:c1", transactionUniqueIdentifier: "123",
  };
  it("sends the required token-charge fields (paymentType=2, paymentNum=1)", () => {
    const f = buildTokenChargeFields(charge);
    expect(f.paymentType).toBe("2");
    expect(f.paymentNum).toBe("1");
    expect(f.sum).toBe("39.00");
    expect(f.cardToken).toHaveLength(40);
    expect(f.cField1).toBe("saas_charge:c1");
    expect(f.transactionUniqueIdentifier).toBe("123");
  });
});

describe("tokenChargeCField1", () => {
  it("namespaces the charge id", () => {
    expect(tokenChargeCField1("c1")).toBe("saas_charge:c1");
  });
});

describe("growTransactionUid", () => {
  it("is deterministic for the same seed", () => {
    expect(growTransactionUid("sd-abc")).toBe(growTransactionUid("sd-abc"));
  });
  it("differs across distinct seeds", () => {
    expect(growTransactionUid("sd-a")).not.toBe(growTransactionUid("sd-b"));
  });
  it("is numeric-only, positive, no leading zero, and <= 2147483647", () => {
    for (const seed of ["sd-1", "charge_xyz", "a", "0000", "ZZZZZZZZ", "cuid-9f8a7b6c5d4e"]) {
      const uid = growTransactionUid(seed);
      expect(uid).toMatch(/^[1-9][0-9]*$/);
      expect(Number(uid)).toBeGreaterThan(0);
      expect(Number(uid)).toBeLessThanOrEqual(2147483647);
    }
  });
});
