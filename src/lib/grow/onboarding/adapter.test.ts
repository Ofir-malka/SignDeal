import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrowOnboardingStatus } from "@/generated/prisma";

// ── Mocked boundaries ─────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findSessionForUpdate: vi.fn(),
  provisionMerchantPending: vi.fn(),
  recordFailedOnboarding: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    growOnboardingCallbackEvent: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));
vi.mock("./correlation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./correlation")>()),
  findSessionForUpdate: mocks.findSessionForUpdate,
}));
vi.mock("./provisioning", () => ({
  provisionMerchantPending: mocks.provisionMerchantPending,
  recordFailedOnboarding: mocks.recordFailedOnboarding,
}));
vi.mock("@/lib/audit/log-audit-event", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { ingestCallback } from "./adapter";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const API_KEY = "84dhSECRETvalue";
const SUCCESS = {
  err: null,
  data: {
    name: "Broker",
    phone: "0500000000",
    api_key: API_KEY,
    user_id: "beasuser123",
    package_id: "1997",
    package_name: "Pro",
    tracking_code: "TRK-9",
    business_title: "Test LTD",
    tracking_status: { id: "3", message: "created" },
  },
  status: "1",
};
const FAILURE = { ...SUCCESS, status: "0" };

function call(body: unknown, opts?: { contentType?: string | null; routeToken?: string }) {
  return ingestCallback({
    rawText: typeof body === "string" ? body : JSON.stringify(body),
    contentType: opts?.contentType === undefined ? "application/json" : opts.contentType,
    sourceIp: "1.2.3.4",
    httpMethod: "POST",
    routeToken: opts?.routeToken ?? "good-token",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROW_ONBOARDING_CALLBACK_TOKEN = "good-token";
  process.env.GROW_ONBOARDING_ENABLED = "true";
  mocks.findUnique.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "evt1" });
  mocks.update.mockResolvedValue({});
  mocks.findSessionForUpdate.mockResolvedValue({
    id: "sess1",
    userId: "user1",
    status: GrowOnboardingStatus.LINK_ISSUED,
  });
  mocks.provisionMerchantPending.mockResolvedValue(undefined);
  mocks.recordFailedOnboarding.mockResolvedValue(undefined);
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

const appliedUpdate = () =>
  mocks.update.mock.calls.find((c) => (c[0] as { data: { outcome?: string } }).data.outcome === "applied");

describe("ingestCallback — security gates", () => {
  it("rejects a bad route token with a generic 200 and stores nothing", async () => {
    const r = await call(SUCCESS, { routeToken: "WRONG" });
    expect(r.httpStatus).toBe(200);
    expect(r.outcome).toBe("rejected");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON content-type (locked to application/json)", async () => {
    const r = await call(SUCCESS, { contentType: "application/x-www-form-urlencoded" });
    expect(r.httpStatus).toBe(200);
    expect(r.outcome).toBe("rejected");
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });
});

describe("ingestCallback — success path", () => {
  it("provisions and marks applied (200), AFTER provisioning", async () => {
    const r = await call(SUCCESS);
    expect(r.httpStatus).toBe(200);
    expect(r.outcome).toBe("applied");
    expect(r.applied).toBe(true);
    expect(mocks.provisionMerchantPending).toHaveBeenCalledTimes(1);
    expect(appliedUpdate()).toBeTruthy();
  });

  it("NEVER stores api_key in sanitizedPayload (rule 9)", async () => {
    await call(SUCCESS);
    const createArg = mocks.create.mock.calls[0][0] as { data: { sanitizedPayload: string } };
    expect(createArg.data.sanitizedPayload).not.toContain(API_KEY);
  });

  it("never passes the api_key value to the audit logger", async () => {
    await call(SUCCESS);
    const serialized = JSON.stringify(mocks.logAuditEvent.mock.calls);
    expect(serialized).not.toContain(API_KEY);
  });
});

describe("ingestCallback — rule 8 (retry/idempotency)", () => {
  it("returns 5xx and does NOT mark applied when provisioning fails", async () => {
    mocks.provisionMerchantPending.mockRejectedValue(new Error("db down before seal"));
    const r = await call(SUCCESS);
    expect(r.httpStatus).toBe(500);
    expect(r.applied).toBe(false);
    expect(appliedUpdate()).toBeFalsy(); // dedup marker NOT set → Grow retries
  });

  it("short-circuits a true duplicate (already applied) without reprocessing", async () => {
    mocks.findUnique.mockResolvedValue({ id: "evtX", outcome: "applied", sessionId: "sessX" });
    const r = await call(SUCCESS);
    expect(r.httpStatus).toBe(200);
    expect(r.outcome).toBe("duplicate");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });

  it("reprocesses a prior non-applied event (does not block retry)", async () => {
    mocks.findUnique.mockResolvedValue({ id: "evtPrev", outcome: "failed", sessionId: "sess1" });
    const r = await call(SUCCESS);
    expect(r.outcome).toBe("applied");
    expect(mocks.provisionMerchantPending).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled(); // reused existing row
  });
});

describe("ingestCallback — correlation, flags, failure status", () => {
  it("returns 200 uncorrelated when no session matches", async () => {
    mocks.findSessionForUpdate.mockResolvedValue(null);
    const r = await call(SUCCESS);
    expect(r.httpStatus).toBe(200);
    expect(r.outcome).toBe("uncorrelated");
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });

  it("defers with 503 when the feature flag is off (no provisioning)", async () => {
    process.env.GROW_ONBOARDING_ENABLED = "false";
    const r = await call(SUCCESS);
    expect(r.httpStatus).toBe(503);
    expect(r.outcome).toBe("deferred");
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });

  it("records FAILED for a non-success callback (status != 1), no merchant provisioning", async () => {
    const r = await call(FAILURE);
    expect(r.outcome).toBe("applied");
    expect(mocks.recordFailedOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.provisionMerchantPending).not.toHaveBeenCalled();
  });
});
