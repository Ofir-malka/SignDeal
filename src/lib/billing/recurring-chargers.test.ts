import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ hypSoft: vi.fn(), grow: vi.fn() }));
// Mock the unchanged HYP charge fn and the Grow adapter so the seam is tested in isolation.
vi.mock("./providers/hyp", () => ({ callHypSoft: mocks.hypSoft }));
vi.mock("./providers/grow/recurring-charger", () => ({ chargeGrowRecurring: mocks.grow }));

import { getRecurringCharger, type RecurringChargeContext } from "./recurring-chargers";

const baseCtx: RecurringChargeContext = {
  billingProvider: "hyp",
  subscriptionId: "sub1",
  userId: "u1",
  chargeId: "co-1",
  amountAgorot: 3900,
  amountShekels: 39,
  info: "plan · monthly",
  hypChargeToken: "tok19",
  hypCardExpMonth: 6,
  hypCardExpYear: 2030,
};

beforeEach(() => vi.clearAllMocks());

describe("getRecurringCharger factory", () => {
  it("routes provider × mode to the right charger", () => {
    expect(getRecurringCharger("grow", "real").provider).toBe("grow");
    expect(getRecurringCharger("hyp", "real").provider).toBe("hyp");
    expect(getRecurringCharger("grow", "stub").provider).toBe("grow");
    expect(getRecurringCharger("hyp", "stub").provider).toBe("hyp");
  });
});

describe("HypRecurringCharger (thin wrapper over callHypSoft)", () => {
  it("ok → neutral ok outcome, forwarding token/expiry/order", async () => {
    mocks.hypSoft.mockResolvedValue({ ok: true, cCode: "0", hypTransId: "h1", authCode: "A1" });
    const r = await getRecurringCharger("hyp", "real").charge(baseCtx);
    expect(r).toEqual({ ok: true, providerTxId: "h1", providerCode: "0", authCode: "A1" });
    expect(mocks.hypSoft).toHaveBeenCalledWith(
      expect.objectContaining({ chargeToken: "tok19", cardExpMonth: 6, cardExpYear: 2030, order: "co-1" }),
    );
  });

  it("!ok → declined (HYP never emits 'error')", async () => {
    mocks.hypSoft.mockResolvedValue({ ok: false, cCode: "33", hypTransId: null, authCode: null });
    expect(await getRecurringCharger("hyp", "real").charge(baseCtx)).toEqual({
      ok: false, failure: "declined", providerTxId: null, providerCode: "33",
    });
  });

  it("missing HYP context → error (defensive; never charges)", async () => {
    const r = await getRecurringCharger("hyp", "real").charge({ ...baseCtx, hypChargeToken: null });
    expect(r).toEqual({ ok: false, failure: "error", providerTxId: null, providerCode: null, reasonTag: "ERR_HYP_CONTEXT_MISSING" });
    expect(mocks.hypSoft).not.toHaveBeenCalled();
  });
});

describe("GrowRecurringCharger delegates to chargeGrowRecurring", () => {
  it("forwards the context and returns its outcome", async () => {
    mocks.grow.mockResolvedValue({ ok: true, providerTxId: "g1", providerCode: "2", authCode: "ap" });
    const ctx = { ...baseCtx, billingProvider: "grow" as const };
    const r = await getRecurringCharger("grow", "real").charge(ctx);
    expect(r).toEqual({ ok: true, providerTxId: "g1", providerCode: "2", authCode: "ap" });
    expect(mocks.grow).toHaveBeenCalledWith(ctx);
  });
});

describe("StubRecurringCharger (no provider network call)", () => {
  it("grow stub → ok statusCode 2, stub txId, Grow adapter NOT called", async () => {
    const r = await getRecurringCharger("grow", "stub").charge({ ...baseCtx, billingProvider: "grow" });
    expect(r).toEqual({ ok: true, providerTxId: "stub-co-1", providerCode: "2", authCode: "STUB" });
    expect(mocks.grow).not.toHaveBeenCalled();
  });

  it("hyp stub → ok cCode 0, stub txId, callHypSoft NOT called", async () => {
    const r = await getRecurringCharger("hyp", "stub").charge(baseCtx);
    expect(r).toEqual({ ok: true, providerTxId: "stub-co-1", providerCode: "0", authCode: "STUB" });
    expect(mocks.hypSoft).not.toHaveBeenCalled();
  });
});
