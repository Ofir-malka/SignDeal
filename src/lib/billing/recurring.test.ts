import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  subFindMany:   vi.fn(),
  subCount:      vi.fn(),
  subFindUnique: vi.fn(),
  subUpdate:     vi.fn(),
  chargeFindFirst: vi.fn(),
  chargeCreate:    vi.fn(),
  chargeUpdate:    vi.fn(),
  eventCreate:     vi.fn(),
  userFindUnique:  vi.fn(),
  msgCreate:       vi.fn(),
  msgUpdate:       vi.fn(),
}));
const seam = vi.hoisted(() => ({ getCharger: vi.fn(), charge: vi.fn() }));
const mail = vi.hoisted(() => ({ paymentFailedEmail: vi.fn(() => ({ subject: "s", text: "t" })), sendEmail: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const tx = {
    billingCharge:     { update: db.chargeUpdate },
    subscription:      { update: db.subUpdate },
    subscriptionEvent: { create: db.eventCreate },
  };
  return {
    prisma: {
      subscription:      { findMany: db.subFindMany, count: db.subCount, findUnique: db.subFindUnique, update: db.subUpdate },
      billingCharge:     { findFirst: db.chargeFindFirst, create: db.chargeCreate, update: db.chargeUpdate },
      subscriptionEvent: { create: db.eventCreate },
      user:              { findUnique: db.userFindUnique },
      message:           { create: db.msgCreate, update: db.msgUpdate },
      $transaction:      vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});
vi.mock("./recurring-chargers", () => ({ getRecurringCharger: seam.getCharger }));
vi.mock("./providers/grow/config", () => ({ isGrowSaasRecurringEnabled: () => true }));
vi.mock("@/lib/audit/log-audit-event", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: mail.sendEmail, paymentFailedEmail: mail.paymentFailedEmail }));

import { processRecurringCharges } from "./recurring";

const DUE = new Date("2026-01-01T00:00:00Z");
const growSub = { id:"gs1", userId:"gu1", plan:"STANDARD", billingInterval:"MONTHLY", status:"TRIALING", nextBillingAt: DUE, billingFailures: 0, cardExpMonth: null, cardExpYear: null, firstPaymentAt: null };
const hypSub  = { id:"hs1", userId:"hu1", plan:"GROWTH",   billingInterval:"MONTHLY", status:"ACTIVE",   nextBillingAt: DUE, billingFailures: 0, cardExpMonth: 6,    cardExpYear: 2030, firstPaymentAt: DUE };

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["ENABLE_REAL_RECURRING_CHARGES", "BILLING_CHARGE_DRY_RUN", "RECURRING_BILLING_PROVIDER"];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.ENABLE_REAL_RECURRING_CHARGES = "true"; // pass the real-charge gate
  delete process.env.BILLING_CHARGE_DRY_RUN;          // not a dry run
  delete process.env.RECURRING_BILLING_PROVIDER;      // real mode (stubMode = false)

  // Default scans: empty; tests override per case.
  db.subFindMany.mockResolvedValue([]);
  db.subCount.mockResolvedValue(0);
  db.subFindUnique.mockResolvedValue({ chargeToken: "tok19" }); // HYP preflight token present
  db.chargeFindFirst.mockResolvedValue(null);
  let n = 0;
  db.chargeCreate.mockImplementation(async () => ({ id: `ch${++n}` }));
  db.chargeUpdate.mockResolvedValue({});
  db.subUpdate.mockResolvedValue({});
  db.eventCreate.mockResolvedValue({});
  db.userFindUnique.mockResolvedValue({ email: "b@x.com", fullName: "Broker" });
  db.msgCreate.mockResolvedValue({ id: "m1" });
  db.msgUpdate.mockResolvedValue({});
  mail.sendEmail.mockResolvedValue({ ok: true, messageId: "x" });
  seam.getCharger.mockReturnValue({ charge: seam.charge });
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
});

/** Scan helper: route hyp/grow findMany to the given rows. */
function scan({ hyp = [], grow = [] }: { hyp?: unknown[]; grow?: unknown[] }) {
  db.subFindMany.mockImplementation(async (args: { where: { billingProvider: string } }) =>
    args.where.billingProvider === "grow" ? grow : hyp,
  );
}
const lastUpdateData = (mockFn: typeof db.chargeUpdate) =>
  (mockFn.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

describe("processRecurringCharges — Grow integration", () => {
  it("#1 Grow success writes ONLY grow* BillingCharge columns (not hyp*) and routes via getRecurringCharger(grow,real)", async () => {
    scan({ grow: [growSub] });
    seam.charge.mockResolvedValue({ ok: true, providerTxId: "tx1", providerCode: "2", authCode: "ap" });

    const r = await processRecurringCharges();

    expect(seam.getCharger).toHaveBeenCalledWith("grow", "real");
    expect(seam.getCharger).not.toHaveBeenCalledWith("hyp", expect.anything());
    const data = lastUpdateData(db.chargeUpdate);
    expect(data).toMatchObject({ status: "SUCCEEDED", growStatusCode: "2", growTransId: "tx1", growApprovalCode: "ap" });
    expect(data).not.toHaveProperty("hypCCode");
    expect(data).not.toHaveProperty("hypTransId");
    expect(db.subUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACTIVE", nextBillingAt: expect.any(Date) }),
    }));
    expect(r.charged).toBe(1);
    expect(r.errored).toBe(0);
    expect(r.byProvider.grow.charged).toBe(1);
  });

  it("#2 Grow declined increments billingFailures and schedules a retry (dunning email sent)", async () => {
    scan({ grow: [growSub] });
    seam.charge.mockResolvedValue({ ok: false, failure: "declined", providerTxId: "txd", providerCode: "33", reasonTag: "DECLINE_33" });

    const r = await processRecurringCharges();

    const subData = (db.subUpdate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;
    expect(subData.billingFailures).toBe(1);
    expect(subData.nextBillingAt).toBeInstanceOf(Date);          // retry scheduled (not null at attempt 1)
    expect(lastUpdateData(db.chargeUpdate)).toMatchObject({ status: "FAILED", growStatusCode: "33" });
    expect(mail.paymentFailedEmail).toHaveBeenCalledTimes(1);    // dunning email
    expect(r.failed).toBe(1);
    expect(r.byProvider.grow.failed).toBe(1);
  });

  it("#3 Grow error: NO billingFailures increment, NO payment-failed email, re-arms nextBillingAt", async () => {
    scan({ grow: [growSub] });
    seam.charge.mockResolvedValue({ ok: false, failure: "error", providerTxId: null, providerCode: null, reasonTag: "ERR_TOKEN_MISSING" });

    const r = await processRecurringCharges();

    const subData = (db.subUpdate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;
    expect(subData).not.toHaveProperty("billingFailures");       // NOT incremented
    expect(subData).not.toHaveProperty("status");                // status unchanged
    expect(subData.nextBillingAt).toBeInstanceOf(Date);          // re-armed
    expect((subData.nextBillingAt as Date).getTime()).toBeGreaterThan(DUE.getTime());
    expect(lastUpdateData(db.chargeUpdate)).toMatchObject({ status: "FAILED", growStatusCode: "ERR_TOKEN_MISSING" });
    expect(mail.paymentFailedEmail).not.toHaveBeenCalled();      // NO dunning email
    expect(mail.sendEmail).not.toHaveBeenCalled();
    expect(db.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ event: "charge_error" }) }));
    expect(r.errored).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.byProvider.grow.errored).toBe(1);
  });

  it("#4/#6 Grow-only run never constructs a HYP charger (routes only through getRecurringCharger(grow,…))", async () => {
    scan({ grow: [growSub] });
    seam.charge.mockResolvedValue({ ok: true, providerTxId: "t", providerCode: "2", authCode: null });
    await processRecurringCharges();
    expect(seam.getCharger).toHaveBeenCalledTimes(1);
    expect(seam.getCharger).toHaveBeenCalledWith("grow", "real");
  });

  it("mixed HYP+Grow batch: each routes to its own charger and writes its own provider columns", async () => {
    scan({ hyp: [hypSub], grow: [growSub] });
    seam.charge.mockImplementation(async (ctx: { billingProvider: string }) =>
      ctx.billingProvider === "grow"
        ? { ok: true, providerTxId: "gtx", providerCode: "2", authCode: "ga" }
        : { ok: true, providerTxId: "htx", providerCode: "0", authCode: "ha" },
    );

    const r = await processRecurringCharges();

    expect(seam.getCharger).toHaveBeenCalledWith("hyp", "real");
    expect(seam.getCharger).toHaveBeenCalledWith("grow", "real");
    const datas = db.chargeUpdate.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(datas.some((d) => d.growStatusCode === "2" && !("hypCCode" in d))).toBe(true);   // grow row → grow*
    expect(datas.some((d) => d.hypCCode === "0" && !("growStatusCode" in d))).toBe(true);    // hyp row → hyp*
    expect(r.charged).toBe(2);
    expect(r.byProvider.grow.charged).toBe(1);
    expect(r.byProvider.hyp.charged).toBe(1);
  });

  it("Grow scan is gated: when no grow rows are due, only HYP is processed", async () => {
    scan({ hyp: [hypSub], grow: [] });
    seam.charge.mockResolvedValue({ ok: true, providerTxId: "htx", providerCode: "0", authCode: "ha" });
    const r = await processRecurringCharges();
    expect(seam.getCharger).toHaveBeenCalledWith("hyp", "real");
    expect(seam.getCharger).not.toHaveBeenCalledWith("grow", expect.anything());
    expect(r.byProvider.grow.charged).toBe(0);
  });
});
