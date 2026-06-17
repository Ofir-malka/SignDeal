import { describe, it, expect } from "vitest";
import {
  buildTokenSetupFields,
  buildProcessInfoFields,
  agorotToShekels,
  tokenSetupCField1,
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
