import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), checkout: vi.fn() }));
vi.mock("./config", () => ({ isGrowSaasEnabled: mocks.enabled }));
vi.mock("./createPaymentProcess.http", () => ({ createGrowSaasTokenCheckout: mocks.checkout }));

import { GrowBillingProvider } from "./provider";

const params = {
  userId: "u1", userEmail: "broker@x.com", userName: "Broker Name", userPhone: "0501234567",
  plan: "STANDARD" as const, interval: "MONTHLY" as const,
  successUrl: "https://app/billing/grow/success", errorUrl: "https://app/billing/error", cancelUrl: "https://app/pricing",
};

beforeEach(() => vi.clearAllMocks());

describe("GrowBillingProvider", () => {
  it("fails closed when GROW_SAAS_ENABLED is off (no http call)", async () => {
    mocks.enabled.mockReturnValue(false);
    const r = await new GrowBillingProvider().createCheckoutSession(params);
    expect(r.ok).toBe(false);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("returns checkoutUrl + grow refs and builds with the right plan amount", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.checkout.mockResolvedValue({ ok: true, url: "https://pay", processId: "pid", processToken: "ptok" });
    const r = await new GrowBillingProvider().createCheckoutSession(params);
    expect(r).toMatchObject({ ok: true, checkoutUrl: "https://pay", growProcessId: "pid", growProcessToken: "ptok" });
    if (r.ok) expect(r.order).toMatch(/^sd-/);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ sumShekels: "39.00", email: "broker@x.com", fullName: "Broker Name", phone: "0501234567" }),
    );
  });

  it("propagates a provider failure", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.checkout.mockResolvedValue({ ok: false, reason: "boom" });
    expect(await new GrowBillingProvider().createCheckoutSession(params)).toEqual({ ok: false, reason: "boom" });
  });
});
