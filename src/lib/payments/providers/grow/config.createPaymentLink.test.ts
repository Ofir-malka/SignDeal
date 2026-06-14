import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isGrowPaymentLinkEnabled,
  getGrowPaymentLinkHost,
  getCreatePaymentLinkUrl,
  getGrowPaymentLinkPageCode,
  getGrowPaymentLinkXApiKey,
  getGrowPaymentLinkNotifyUrl,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("isGrowPaymentLinkEnabled", () => {
  it("defaults to false", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_ENABLED", "");
    expect(isGrowPaymentLinkEnabled()).toBe(false);
  });
  it("true only for 'true'", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_ENABLED", "true");
    expect(isGrowPaymentLinkEnabled()).toBe(true);
  });
});

describe("CreatePaymentLink host/url (grow.link, NOT meshulam.co.il)", () => {
  it("defaults to the sandbox grow.link host", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_HOST", "");
    vi.stubEnv("GROW_ENVIRONMENT", "");
    expect(getGrowPaymentLinkHost()).toBe("sandboxapi.grow.link");
    expect(getCreatePaymentLinkUrl()).toBe(
      "https://sandboxapi.grow.link/api/light/server/1.0/CreatePaymentLink",
    );
  });
  it("uses secure.grow.link in production", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_HOST", "");
    vi.stubEnv("GROW_ENVIRONMENT", "production");
    expect(getGrowPaymentLinkHost()).toBe("secure.grow.link");
  });
  it("honors an explicit host override", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_HOST", "custom.grow.link");
    expect(getGrowPaymentLinkHost()).toBe("custom.grow.link");
  });
});

describe("CreatePaymentLink required env (throws when unset)", () => {
  it("pageCode: throws unset, returns when set", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_PAGECODE", "");
    expect(() => getGrowPaymentLinkPageCode()).toThrow();
    vi.stubEnv("GROW_PAYMENT_LINK_PAGECODE", "12796f74fc4f");
    expect(getGrowPaymentLinkPageCode()).toBe("12796f74fc4f");
  });
  it("x-api-key: throws unset, returns when set", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_X_API_KEY", "");
    expect(() => getGrowPaymentLinkXApiKey()).toThrow();
    vi.stubEnv("GROW_PAYMENT_LINK_X_API_KEY", "PROD_PRODUCT_KEY");
    expect(getGrowPaymentLinkXApiKey()).toBe("PROD_PRODUCT_KEY");
  });
});

describe("notifyUrl is P3-ready (omitted in Step 1b)", () => {
  it("null when unset; returns the flat URL when set", () => {
    vi.stubEnv("GROW_PAYMENT_LINK_NOTIFY_URL", "");
    expect(getGrowPaymentLinkNotifyUrl()).toBeNull();
    vi.stubEnv("GROW_PAYMENT_LINK_NOTIFY_URL", "https://www.signdeal.co.il/api/grow/webhook");
    expect(getGrowPaymentLinkNotifyUrl()).toBe("https://www.signdeal.co.il/api/grow/webhook");
  });
});
