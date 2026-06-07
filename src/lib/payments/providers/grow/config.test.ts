import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isGrowPaymentsEnabled,
  shouldUseGrowRail,
  getGrowPaymentHost,
  getCreatePaymentProcessUrl,
  getGrowPaymentPageCode,
  getGrowCompanyCommission,
  shouldSendTransactionUniqueIdentifier,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("isGrowPaymentsEnabled", () => {
  it("defaults to false", () => {
    vi.stubEnv("GROW_PAYMENTS_ENABLED", "");
    expect(isGrowPaymentsEnabled()).toBe(false);
  });
  it("true only for 'true'", () => {
    vi.stubEnv("GROW_PAYMENTS_ENABLED", "true");
    expect(isGrowPaymentsEnabled()).toBe(true);
  });
});

describe("shouldUseGrowRail — PENDING_VERIFICATION / inactive must NOT route to Grow", () => {
  it("true only when enabled AND active", () => expect(shouldUseGrowRail(true, true)).toBe(true));
  it("false when flag off", () => expect(shouldUseGrowRail(false, true)).toBe(false));
  it("false when merchant inactive (PENDING_VERIFICATION)", () => expect(shouldUseGrowRail(true, false)).toBe(false));
  it("false when no merchant", () => {
    expect(shouldUseGrowRail(true, null)).toBe(false);
    expect(shouldUseGrowRail(true, undefined)).toBe(false);
  });
});

describe("host derivation", () => {
  it("defaults to the sandbox host", () => {
    vi.stubEnv("GROW_PAYMENT_HOST", "");
    vi.stubEnv("GROW_ENVIRONMENT", "");
    expect(getGrowPaymentHost()).toBe("sandbox.meshulam.co.il");
  });
  it("uses the production host when GROW_ENVIRONMENT=production", () => {
    vi.stubEnv("GROW_PAYMENT_HOST", "");
    vi.stubEnv("GROW_ENVIRONMENT", "production");
    expect(getGrowPaymentHost()).toBe("secure.meshulam.co.il");
  });
  it("explicit GROW_PAYMENT_HOST overrides", () => {
    vi.stubEnv("GROW_PAYMENT_HOST", "custom.host");
    expect(getGrowPaymentHost()).toBe("custom.host");
  });
  it("builds the createPaymentProcess url", () => {
    vi.stubEnv("GROW_PAYMENT_HOST", "");
    vi.stubEnv("GROW_ENVIRONMENT", "");
    expect(getCreatePaymentProcessUrl()).toBe(
      "https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess",
    );
  });
});

describe("pageCode / commission / unique-id flag", () => {
  it("reads the configured pageCode", () => {
    vi.stubEnv("GROW_PAYMENT_PAGECODE", "12796f74fc4f");
    expect(getGrowPaymentPageCode()).toBe("12796f74fc4f");
  });
  it("throws when pageCode is unset", () => {
    vi.stubEnv("GROW_PAYMENT_PAGECODE", "");
    expect(() => getGrowPaymentPageCode()).toThrow();
  });
  it("commission is null when unset", () => {
    vi.stubEnv("GROW_COMPANY_COMMISSION", "");
    expect(getGrowCompanyCommission()).toBeNull();
  });
  it("transactionUniqueIdentifier flag defaults false", () => {
    vi.stubEnv("GROW_PAYMENT_SEND_UNIQUE_ID", "");
    expect(shouldSendTransactionUniqueIdentifier()).toBe(false);
  });
});
