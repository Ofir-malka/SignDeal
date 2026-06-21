import { describe, it, expect } from "vitest";
import { classifyGrowCharge, GROW_CHARGE_STATUS_CODES } from "./status-codes";
import type { GrowChargeHttpResult } from "./types";

/** Build a transport:"ok" result (the parsed createTransactionWithToken body) with overrides. */
function ok(fields: Partial<{
  status: string | null;
  statusCode: string | null;
  errId: number | null;
  transactionId: string | null;
  approvalCode: string | null;
}>): GrowChargeHttpResult {
  return {
    transport: "ok",
    status: fields.status ?? "1",
    statusCode: fields.statusCode ?? null,
    errId: fields.errId ?? null,
    transactionId: fields.transactionId ?? null,
    approvalCode: fields.approvalCode ?? null,
  };
}

describe("classifyGrowCharge (server→Grow createTransactionWithToken result)", () => {
  it("statusCode 2 → paid", () => {
    const c = classifyGrowCharge(ok({ statusCode: "2", transactionId: "tx1", approvalCode: "a1" }));
    expect(c.outcome).toBe("paid");
    expect(c.transactionId).toBe("tx1");
    expect(c.approvalCode).toBe("a1");
    expect(c.reasonTag).toBeNull();
  });

  it("config/request error (errId) → error, and errId wins over a 'paid' statusCode", () => {
    const c = classifyGrowCharge(ok({ status: "1", statusCode: "2", errId: 54 }));
    expect(c.outcome).toBe("error");
    expect(c.reasonTag).toBe("ERR_CONFIG_54");
  });

  it("status != '1' → error", () => {
    expect(classifyGrowCharge(ok({ status: "0", statusCode: null })).outcome).toBe("error");
  });

  it("statusCode 11 (saved-not-charged on a charge) → error anomaly", () => {
    const c = classifyGrowCharge(ok({ statusCode: "11" }));
    expect(c.outcome).toBe("error");
    expect(c.reasonTag).toBe("ERR_ANOMALY_11");
  });

  it("unknown statusCode → declined (conservative), with a decline reason tag", () => {
    const c = classifyGrowCharge(ok({ statusCode: "6" }));
    expect(c.outcome).toBe("declined");
    expect(c.reasonTag).toBe("DECLINE_6");
  });

  it("transport token_missing → error ERR_TOKEN_MISSING", () => {
    const c = classifyGrowCharge({ transport: "token_missing", reason: "secret purged" });
    expect(c.outcome).toBe("error");
    expect(c.reasonTag).toBe("ERR_TOKEN_MISSING");
  });

  it("transport network_error → error ERR_TRANSPORT (distinct from token_missing)", () => {
    const c = classifyGrowCharge({ transport: "network_error", reason: "timeout" });
    expect(c.outcome).toBe("error");
    expect(c.reasonTag).toBe("ERR_TRANSPORT");
  });

  it("never silent success: ONLY statusCode 2 yields paid", () => {
    for (const code of ["0", "1", "3", "11", "99", null] as (string | null)[]) {
      expect(classifyGrowCharge(ok({ statusCode: code })).outcome).not.toBe("paid");
    }
  });

  it("catalogue is the source of truth for 2 and 11", () => {
    expect(GROW_CHARGE_STATUS_CODES["2"].outcome).toBe("paid");
    expect(GROW_CHARGE_STATUS_CODES["11"].outcome).toBe("error");
  });
});
