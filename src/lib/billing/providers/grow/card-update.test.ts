import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const checkoutUpdateMany = vi.fn();
  const subUpdate = vi.fn();
  const eventCreate = vi.fn();
  // Sentinel tx handed to $transaction(run): proves claim/rotate/update/event share one tx.
  const tx = {
    billingCheckout: { updateMany: checkoutUpdateMany },
    subscription: { update: subUpdate },
    subscriptionEvent: { create: eventCreate },
  };
  return {
    findFirst: vi.fn(),
    subFindUnique: vi.fn(),
    processInfo: vi.fn(),
    rotateToken: vi.fn(),
    audit: vi.fn(),
    checkoutUpdateMany,
    subUpdate,
    eventCreate,
    tx,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn(tx)),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Reads run on the base client (outside the txn); mutations run on the sentinel tx below.
    billingCheckout: { findFirst: mocks.findFirst },
    subscription: { findUnique: mocks.subFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("./getPaymentProcessInfo.http", () => ({ getGrowSaasProcessInfo: mocks.processInfo }));
vi.mock("@/lib/billing/secrets", () => ({ rotateGrowSaasToken: mocks.rotateToken }));
vi.mock("@/lib/audit/log-audit-event", () => ({ logAuditEvent: mocks.audit }));

import { verifyAndApplyGrowCardUpdate } from "./card-update";

const CHECKOUT = (purpose: "payment_method_update" | "recovery") => ({
  id: "co1", order: "sd-1", purpose, growProcessId: "pid", growProcessToken: "ptok",
});
// findSavedToken + cardUpdateCField1 are REAL; the saved token must carry the card-update cField1.
const okData = (over: Record<string, unknown> = {}) => ({
  transactions: [{
    statusCode: "11", cardToken: "x".repeat(40), cardSuffix: "4580",
    customFields: { cField1: "saas_card_update:sd-1" }, processId: "pid", ...over,
  }],
});
const lastSubData = () => (mocks.subUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(CHECKOUT("payment_method_update"));
  mocks.processInfo.mockResolvedValue({ ok: true, data: okData() });
  mocks.subFindUnique.mockResolvedValue({ id: "sub1" });
  mocks.checkoutUpdateMany.mockResolvedValue({ count: 1 });
  mocks.subUpdate.mockResolvedValue({});
  mocks.eventCreate.mockResolvedValue({});
  mocks.rotateToken.mockResolvedValue("newRef");
  mocks.audit.mockResolvedValue(undefined);
});

describe("verifyAndApplyGrowCardUpdate", () => {
  it("no pending card-update checkout → no_checkout (no rotate)", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await verifyAndApplyGrowCardUpdate({ userId: "u" })).toEqual({ state: "no_checkout" });
    expect(mocks.rotateToken).not.toHaveBeenCalled();
  });

  it("getPaymentProcessInfo error → pending (no claim, no rotate)", async () => {
    mocks.processInfo.mockResolvedValue({ ok: false, reason: "transient" });
    expect((await verifyAndApplyGrowCardUpdate({ userId: "u" })).state).toBe("pending");
    expect(mocks.checkoutUpdateMany).not.toHaveBeenCalled();
    expect(mocks.rotateToken).not.toHaveBeenCalled();
  });

  it("cField1 mismatch → failed (no rotate)", async () => {
    mocks.processInfo.mockResolvedValue({ ok: true, data: okData({ customFields: { cField1: "saas_token_setup:sd-1" } }) });
    expect((await verifyAndApplyGrowCardUpdate({ userId: "u" })).state).toBe("failed");
    expect(mocks.rotateToken).not.toHaveBeenCalled();
  });

  it("statusCode != 11 → failed (no rotate)", async () => {
    mocks.processInfo.mockResolvedValue({ ok: true, data: okData({ statusCode: "2" }) });
    expect((await verifyAndApplyGrowCardUpdate({ userId: "u" })).state).toBe("failed");
    expect(mocks.rotateToken).not.toHaveBeenCalled();
  });

  it("claim lost (count 0) → applied, NO rotate (claim-gated: no double-rotate)", async () => {
    mocks.checkoutUpdateMany.mockResolvedValue({ count: 0 });
    expect((await verifyAndApplyGrowCardUpdate({ userId: "u" })).state).toBe("applied");
    expect(mocks.rotateToken).not.toHaveBeenCalled();
    expect(mocks.subUpdate).not.toHaveBeenCalled();
  });

  it("payment_method_update: rotates + card-only update (NO status/billingFailures/nextBillingAt)", async () => {
    const r = await verifyAndApplyGrowCardUpdate({ userId: "u" });
    expect(r.state).toBe("applied");
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // claim+rotate+update+event in one txn
    expect(mocks.rotateToken).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub1", plaintext: "x".repeat(40) }),
      { tx: mocks.tx }, // rotate participates in the SAME txn as the claim + subscription update
    );
    const data = lastSubData();
    expect(data).toMatchObject({ cardLast4: "4580" });
    expect(data.tokenCreatedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("billingFailures");
    expect(data).not.toHaveProperty("nextBillingAt");
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ event: "payment_method_updated" }) }));
  });

  it("recovery: rotates + clears billingFailures + ACTIVE + re-arms nextBillingAt", async () => {
    mocks.findFirst.mockResolvedValue(CHECKOUT("recovery"));
    const r = await verifyAndApplyGrowCardUpdate({ userId: "u" });
    expect(r.state).toBe("applied");
    expect(mocks.rotateToken).toHaveBeenCalledTimes(1);
    expect(mocks.rotateToken).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub1" }),
      { tx: mocks.tx }, // recovery rotate also participates in the one txn
    );
    const data = lastSubData();
    expect(data).toMatchObject({ cardLast4: "4580", billingFailures: 0, status: "ACTIVE" });
    expect(data.nextBillingAt).toBeInstanceOf(Date);
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ event: "payment_recovered" }) }));
  });

  it("never logs the plaintext cardToken or processToken", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyAndApplyGrowCardUpdate({ userId: "user-abcdef12" });
    const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join(" ");
    expect(logged).not.toContain("x".repeat(40)); // the cardToken plaintext
    expect(logged).not.toContain("ptok");          // the processToken
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
