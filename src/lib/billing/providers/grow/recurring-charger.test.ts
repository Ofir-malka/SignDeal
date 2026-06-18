import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ charge: vi.fn() }));
// Mock ONLY the Step-2 HTTP layer; classifyGrowCharge (Step 1) is the REAL implementation.
vi.mock("./createTransactionWithToken.http", () => ({ createGrowSaasTokenCharge: mocks.charge }));

import { chargeGrowRecurring } from "./recurring-charger";

const ctx = {
  billingProvider: "grow" as const,
  subscriptionId: "sub1",
  userId: "u1",
  chargeId: "co-1",
  amountAgorot: 3900,
  amountShekels: 39,
  info: "plan · monthly",
};

beforeEach(() => vi.clearAllMocks());

describe("chargeGrowRecurring (Grow Rail A adapter)", () => {
  it("paid (statusCode 2) → ok with txId / code / authCode", async () => {
    mocks.charge.mockResolvedValue({ transport: "ok", status: "1", statusCode: "2", errId: null, transactionId: "tx9", approvalCode: "ap1" });
    expect(await chargeGrowRecurring(ctx)).toEqual({ ok: true, providerTxId: "tx9", providerCode: "2", authCode: "ap1" });
  });

  it("unknown statusCode → declined (retryable), with decline reason tag", async () => {
    mocks.charge.mockResolvedValue({ transport: "ok", status: "1", statusCode: "6", errId: null, transactionId: "tx6", approvalCode: null });
    expect(await chargeGrowRecurring(ctx)).toEqual({
      ok: false, failure: "declined", providerTxId: "tx6", providerCode: "6", reasonTag: "DECLINE_6",
    });
  });

  it("request/config error (errId) → error, NOT declined (no dunning)", async () => {
    mocks.charge.mockResolvedValue({ transport: "ok", status: "1", statusCode: "2", errId: 54, transactionId: null, approvalCode: null });
    const r = await chargeGrowRecurring(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("error");
      expect(r.reasonTag).toBe("ERR_CONFIG_54");
    }
  });

  it("token_missing → error ERR_TOKEN_MISSING", async () => {
    mocks.charge.mockResolvedValue({ transport: "token_missing", reason: "secret purged" });
    const r = await chargeGrowRecurring(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("error");
      expect(r.reasonTag).toBe("ERR_TOKEN_MISSING");
    }
  });

  it("network_error → error ERR_TRANSPORT", async () => {
    mocks.charge.mockResolvedValue({ transport: "network_error", reason: "timeout" });
    const r = await chargeGrowRecurring(ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("error");
      expect(r.reasonTag).toBe("ERR_TRANSPORT");
    }
  });

  it("forwards subscriptionId / amountAgorot / chargeId / description to the HTTP layer", async () => {
    mocks.charge.mockResolvedValue({ transport: "ok", status: "1", statusCode: "2", errId: null, transactionId: "t", approvalCode: null });
    await chargeGrowRecurring(ctx);
    expect(mocks.charge).toHaveBeenCalledWith({ subscriptionId: "sub1", amountAgorot: 3900, chargeId: "co-1", description: "plan · monthly" });
  });
});
