import { describe, it, expect } from "vitest";
import { parseCallbackBody, sanitizeForCapture, redactRawPreview } from "./webhook-capture";

describe("parseCallbackBody", () => {
  it("parses application/json", () => {
    const r = parseCallbackBody(`{"status":"1","transactionId":"42"}`, "application/json");
    expect(r.kind).toBe("json");
    expect(r.data).toMatchObject({ status: "1", transactionId: "42" });
  });

  it("parses application/x-www-form-urlencoded", () => {
    const r = parseCallbackBody(
      "status=1&transactionId=42&asmachta=99&cField1=pay_123",
      "application/x-www-form-urlencoded",
    );
    expect(r.kind).toBe("form");
    expect(r.data).toMatchObject({ status: "1", transactionId: "42", asmachta: "99", cField1: "pay_123" });
  });

  it("returns empty for a blank body", () => {
    expect(parseCallbackBody("", null).kind).toBe("empty");
  });

  it("best-effort parses JSON without a content-type", () => {
    expect(parseCallbackBody(`{"a":1}`, null).kind).toBe("json");
  });

  it("best-effort parses form without a content-type", () => {
    expect(parseCallbackBody("a=1&b=2", null).kind).toBe("form");
  });
});

describe("sanitizeForCapture", () => {
  it("redacts token/apiKey/secret VALUES but keeps the key names", () => {
    const out = sanitizeForCapture({
      paymentLinkProcessToken: "secrettok",
      apiKey: "brokerkey",
      transactionToken: "tt",
      status: "1",
    }) as Record<string, unknown>;
    expect(out.paymentLinkProcessToken).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.transactionToken).toBe("[redacted]");
    expect(out.status).toBe("1");
  });

  it("masks PAN-like digit runs but keeps cardSuffix", () => {
    const out = sanitizeForCapture({ pan: "4580123412341234", cardSuffix: "1234" }) as Record<string, unknown>;
    expect(out.pan).toBe("[redacted-pan]");
    expect(out.cardSuffix).toBe("1234");
  });

  it("recurses into nested arrays/objects (e.g. productData)", () => {
    const out = sanitizeForCapture({ productData: [{ name: "x", token: "z" }] }) as {
      productData: Array<Record<string, unknown>>;
    };
    expect(out.productData[0].name).toBe("x");
    expect(out.productData[0].token).toBe("[redacted]");
  });
});

describe("redactRawPreview", () => {
  it("redacts token= values, keeps non-secret pairs, truncates", () => {
    const out = redactRawPreview("status=1&token=abcdef123&sum=100");
    expect(out).not.toContain("abcdef123");
    expect(out).toContain("status=1");
    expect(out).toContain("sum=100");
  });
});
