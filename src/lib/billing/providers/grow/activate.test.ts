import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  subFindUnique: vi.fn(),
  subUpdateMany: vi.fn(),
  checkoutUpdateMany: vi.fn(),
  eventCreate: vi.fn(),
  processInfo: vi.fn(),
  storeToken: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingCheckout: { findFirst: mocks.findFirst, updateMany: mocks.checkoutUpdateMany },
    subscription: { findUnique: mocks.subFindUnique, updateMany: mocks.subUpdateMany },
    subscriptionEvent: { create: mocks.eventCreate },
  },
}));
vi.mock("./getPaymentProcessInfo.http", () => ({ getGrowSaasProcessInfo: mocks.processInfo }));
vi.mock("@/lib/billing/secrets", () => ({ storeGrowSaasToken: mocks.storeToken }));
vi.mock("@/lib/audit/log-audit-event", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/plans", () => ({ TRIAL_DAYS: 14 }));

import { verifyAndActivateGrowTokenSetup } from "./activate";

const CHECKOUT = { id: "co1", order: "sd-1", plan: "STANDARD", interval: "MONTHLY", growProcessId: "pid", growProcessToken: "ptok" };
const okData = (over: Record<string, unknown> = {}) => ({
  transactions: [{
    statusCode: "11", cardToken: "x".repeat(40), cardSuffix: "4580",
    customFields: { cField1: "saas_token_setup:sd-1" }, processId: "pid", ...over,
  }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(CHECKOUT);
  mocks.subFindUnique.mockResolvedValue({ id: "sub1" });
  mocks.subUpdateMany.mockResolvedValue({ count: 1 });
  mocks.checkoutUpdateMany.mockResolvedValue({ count: 1 });
  mocks.eventCreate.mockResolvedValue({});
  mocks.storeToken.mockResolvedValue("ref1");
  mocks.processInfo.mockResolvedValue({ ok: true, data: okData() });
});

describe("verifyAndActivateGrowTokenSetup", () => {
  it("no pending checkout → no_checkout", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await verifyAndActivateGrowTokenSetup({ userId: "u" })).toEqual({ state: "no_checkout" });
  });

  it("getPaymentProcessInfo error → pending, no activation", async () => {
    mocks.processInfo.mockResolvedValue({ ok: false, reason: "transient" });
    const r = await verifyAndActivateGrowTokenSetup({ userId: "u" });
    expect(r.state).toBe("pending");
    expect(mocks.storeToken).not.toHaveBeenCalled();
    expect(mocks.subUpdateMany).not.toHaveBeenCalled();
  });

  it("statusCode != 11 → failed, no token stored", async () => {
    mocks.processInfo.mockResolvedValue({ ok: true, data: okData({ statusCode: "2" }) });
    expect((await verifyAndActivateGrowTokenSetup({ userId: "u" })).state).toBe("failed");
    expect(mocks.storeToken).not.toHaveBeenCalled();
    expect(mocks.subUpdateMany).not.toHaveBeenCalled();
  });

  it("cField1 mismatch → failed", async () => {
    mocks.processInfo.mockResolvedValue({ ok: true, data: okData({ customFields: { cField1: "saas_token_setup:OTHER" } }) });
    expect((await verifyAndActivateGrowTokenSetup({ userId: "u" })).state).toBe("failed");
  });

  it("all checks pass → seals token, TRIALING, event + audit", async () => {
    const r = await verifyAndActivateGrowTokenSetup({ userId: "u" });
    expect(r.state).toBe("trial_started");
    expect(mocks.storeToken).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub1" }));
    expect(mocks.subUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u", status: "INCOMPLETE" },
      data: expect.objectContaining({ status: "TRIALING", billingProvider: "grow", cardLast4: "4580" }),
    }));
    expect(mocks.checkoutUpdateMany).toHaveBeenCalled();
    expect(mocks.eventCreate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("idempotent: already TRIALING (count 0) → trial_started, no duplicate event", async () => {
    mocks.subUpdateMany.mockResolvedValue({ count: 0 });
    mocks.subFindUnique.mockReset();
    mocks.subFindUnique
      .mockResolvedValueOnce({ id: "sub1" })       // sub lookup
      .mockResolvedValueOnce({ status: "TRIALING" }); // current-state confirm
    const r = await verifyAndActivateGrowTokenSetup({ userId: "u" });
    expect(r.state).toBe("trial_started");
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });
});
