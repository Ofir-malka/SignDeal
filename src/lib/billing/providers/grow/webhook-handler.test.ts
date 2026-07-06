import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  eventCreate: vi.fn(),
  eventUpdateMany: vi.fn(),
  checkoutFindUnique: vi.fn(),
  activate: vi.fn(),
  cardUpdate: vi.fn(),
  webhookEnabled: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: { create: mocks.eventCreate, updateMany: mocks.eventUpdateMany },
    billingCheckout: { findUnique: mocks.checkoutFindUnique },
  },
}));
vi.mock("./config", () => ({ isGrowSaasWebhookEnabled: mocks.webhookEnabled }));
vi.mock("./activate", () => ({ verifyAndActivateGrowTokenSetup: mocks.activate }));
vi.mock("./card-update", () => ({ verifyAndApplyGrowCardUpdate: mocks.cardUpdate }));

import { processGrowSaasCallback } from "./webhook-handler";

const FORM_CT = "application/x-www-form-urlencoded";
const body = (cField1: string, extra = "") =>
  `data[customFields][cField1]=${encodeURIComponent(cField1)}&data[transactionId]=tx1${extra}`;
const call = (rawText: string) => processGrowSaasCallback({ rawText, contentType: FORM_CT, sourceIp: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webhookEnabled.mockReturnValue(true);
  mocks.eventCreate.mockResolvedValue({});
  mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
  mocks.checkoutFindUnique.mockResolvedValue({ userId: "u1" });
  mocks.activate.mockResolvedValue({ state: "trial_started" });
  mocks.cardUpdate.mockResolvedValue({ state: "applied" });
});

describe("shadow mode (GROW_SAAS_WEBHOOK_ENABLED off — the default)", () => {
  it("captures as grow_saas but NEVER mutates (no verify calls, no checkout lookup)", async () => {
    mocks.webhookEnabled.mockReturnValue(false);
    const r = await call(body("saas_token_setup:sd-1"));
    expect(r).toEqual({ httpStatus: 200, outcome: "disabled_shadow_mode" });
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: "grow_saas", status: "RECEIVED" }) }),
    );
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
    expect(mocks.checkoutFindUnique).not.toHaveBeenCalled();
  });
});

describe("enabled — namespace routing", () => {
  it("saas_token_setup:<order> → checkout lookup by order → activate({userId}) → PROCESSED", async () => {
    const r = await call(body("saas_token_setup:sd-1"));
    expect(mocks.checkoutFindUnique).toHaveBeenCalledWith({ where: { order: "sd-1" }, select: { userId: true } });
    expect(mocks.activate).toHaveBeenCalledWith({ userId: "u1" });
    expect(r).toEqual({ httpStatus: 200, outcome: "trial_started" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });

  it("saas_card_update:<order> → cardUpdate({userId}) → applied → PROCESSED", async () => {
    const r = await call(body("saas_card_update:sd-2"));
    expect(mocks.cardUpdate).toHaveBeenCalledWith({ userId: "u1" });
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(r).toEqual({ httpStatus: 200, outcome: "applied" });
  });

  it("saas_charge → IGNORED (engine already recorded synchronously), no verify calls", async () => {
    const r = await call(body("saas_charge:ch1"));
    expect(r).toEqual({ httpStatus: 200, outcome: "recurring_recorded_synchronously" });
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.cardUpdate).not.toHaveBeenCalled();
  });

  it("unknown saas namespace → IGNORED", async () => {
    const r = await call(body("saas_weird:x"));
    expect(r).toEqual({ httpStatus: 200, outcome: "unknown_saas_namespace" });
  });

  it("no matching checkout for the order → uncorrelated, no verify call", async () => {
    mocks.checkoutFindUnique.mockResolvedValue(null);
    const r = await call(body("saas_token_setup:sd-gone"));
    expect(r).toEqual({ httpStatus: 200, outcome: "uncorrelated" });
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("no cField1 (merchant-classified event) → IGNORED no_cfield1", async () => {
    const r = await call("data[userId]=saas-uid&data[transactionId]=tx9");
    expect(r).toEqual({ httpStatus: 200, outcome: "no_cfield1" });
  });
});

describe("verify-state mapping (non-success stays IGNORED — poller is primary)", () => {
  it("pending → IGNORED 'pending'", async () => {
    mocks.activate.mockResolvedValue({ state: "pending" });
    expect(await call(body("saas_token_setup:sd-1"))).toEqual({ httpStatus: 200, outcome: "pending" });
  });

  it("failed → IGNORED 'verify_failed'; no_checkout → 'no_checkout'", async () => {
    mocks.cardUpdate.mockResolvedValue({ state: "failed" });
    expect(await call(body("saas_card_update:sd-2"))).toEqual({ httpStatus: 200, outcome: "verify_failed" });
    mocks.cardUpdate.mockResolvedValue({ state: "no_checkout" });
    expect(await call(body("saas_card_update:sd-2"))).toEqual({ httpStatus: 200, outcome: "no_checkout" });
  });
});

describe("robustness", () => {
  it("duplicate WebhookEvent (P2002 on Grow retry) → still proceeds to the verify call", async () => {
    mocks.eventCreate.mockRejectedValue({ code: "P2002" });
    const r = await call(body("saas_token_setup:sd-1"));
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(r.outcome).toBe("trial_started");
  });

  it("verify function throws → FAILED outcome but HTTP 200 (never 5xx from Rail A)", async () => {
    mocks.activate.mockRejectedValue(new Error("boom"));
    const r = await call(body("saas_token_setup:sd-1"));
    expect(r).toEqual({ httpStatus: 200, outcome: "handler_error" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("sanitizes captured payload: cardToken value never stored, key preserved", async () => {
    const secret = "SUPERSECRETTOKENVALUE1234567890";
    await call(body("saas_token_setup:sd-1", `&data[cardToken]=${secret}`));
    const stored = JSON.stringify(mocks.eventCreate.mock.calls.at(-1)![0]);
    expect(stored).not.toContain(secret);
    expect(stored).toContain("cardToken");   // shape preserved
    expect(stored).toContain("[redacted]");
  });
});
