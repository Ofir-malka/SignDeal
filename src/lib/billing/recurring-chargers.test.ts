import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ grow: vi.fn() }));
// Mock the Grow adapter so the seam is tested in isolation.
vi.mock("./providers/grow/recurring-charger", () => ({ chargeGrowRecurring: mocks.grow }));

import { getRecurringCharger, type RecurringChargeContext } from "./recurring-chargers";

const baseCtx: RecurringChargeContext = {
  billingProvider: "grow",
  subscriptionId: "sub1",
  userId: "u1",
  chargeId: "co-1",
  amountAgorot: 3900,
  amountShekels: 39,
  info: "plan · monthly",
};

beforeEach(() => vi.clearAllMocks());

describe("getRecurringCharger factory (Grow-only)", () => {
  it("routes mode to the right charger; provider is always 'grow'", () => {
    expect(getRecurringCharger("grow", "real").provider).toBe("grow");
    expect(getRecurringCharger("grow", "stub").provider).toBe("grow");
  });
});

describe("GrowRecurringCharger delegates to chargeGrowRecurring", () => {
  it("forwards the context and returns its outcome", async () => {
    mocks.grow.mockResolvedValue({ ok: true, providerTxId: "g1", providerCode: "2", authCode: "ap" });
    const r = await getRecurringCharger("grow", "real").charge(baseCtx);
    expect(r).toEqual({ ok: true, providerTxId: "g1", providerCode: "2", authCode: "ap" });
    expect(mocks.grow).toHaveBeenCalledWith(baseCtx);
  });
});

describe("StubRecurringCharger (no provider network call)", () => {
  it("grow stub → ok statusCode 2, stub txId, Grow adapter NOT called", async () => {
    const r = await getRecurringCharger("grow", "stub").charge(baseCtx);
    expect(r).toEqual({ ok: true, providerTxId: "stub-co-1", providerCode: "2", authCode: "STUB" });
    expect(mocks.grow).not.toHaveBeenCalled();
  });
});
