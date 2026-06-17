import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isGrowSaasEnabled,
  getGrowSaasHost,
  getGrowSaasCreatePaymentProcessUrl,
  getGrowSaasGetPaymentProcessInfoUrl,
  getGrowSaasUserId,
  getGrowSaasPageCode,
} from "./config";

const KEYS = ["GROW_SAAS_ENABLED", "GROW_SAAS_ENVIRONMENT", "GROW_SAAS_HOST", "GROW_SAAS_USER_ID", "GROW_SAAS_PAGECODE"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("grow saas config", () => {
  it("isGrowSaasEnabled defaults off, true when 'true'", () => {
    expect(isGrowSaasEnabled()).toBe(false);
    process.env.GROW_SAAS_ENABLED = "true";
    expect(isGrowSaasEnabled()).toBe(true);
  });

  it("host: sandbox default, production by env, explicit override wins", () => {
    expect(getGrowSaasHost()).toBe("sandbox.meshulam.co.il");
    process.env.GROW_SAAS_ENVIRONMENT = "production";
    expect(getGrowSaasHost()).toBe("secure.meshulam.co.il");
    process.env.GROW_SAAS_HOST = "custom.example.com";
    expect(getGrowSaasHost()).toBe("custom.example.com");
  });

  it("endpoint URLs", () => {
    expect(getGrowSaasCreatePaymentProcessUrl()).toBe(
      "https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess",
    );
    expect(getGrowSaasGetPaymentProcessInfoUrl()).toBe(
      "https://sandbox.meshulam.co.il/api/light/server/1.0/getPaymentProcessInfo",
    );
  });

  it("userId / pageCode are required", () => {
    expect(() => getGrowSaasUserId()).toThrow();
    expect(() => getGrowSaasPageCode()).toThrow();
    process.env.GROW_SAAS_USER_ID = "u1";
    process.env.GROW_SAAS_PAGECODE = "p1";
    expect(getGrowSaasUserId()).toBe("u1");
    expect(getGrowSaasPageCode()).toBe("p1");
  });
});
