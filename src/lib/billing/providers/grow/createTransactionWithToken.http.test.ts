import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SecretNotFoundError } from "@/lib/secrets/errors";

const mocks = vi.hoisted(() => ({
  getCreds: vi.fn(),
  getApiKey: vi.fn(),
}));

// Reveal-bearing secret facade is mocked; request-builder + parse-response are REAL so the
// test verifies the actual outgoing request shape and the actual response parsing.
vi.mock("@/lib/billing/secrets", () => ({
  getGrowSaasBillingCredentials: mocks.getCreds,
  getGrowSaasMerchantApiKey: mocks.getApiKey,
}));
vi.mock("./config", () => ({
  getGrowSaasCreateTransactionWithTokenUrl: () =>
    "https://sandbox.meshulam.co.il/api/light/server/1.0/createTransactionWithToken",
  getGrowSaasUserId: () => "u-merchant",
  getGrowSaasPageCode: () => "pc-merchant",
}));

import { createGrowSaasTokenCharge } from "./createTransactionWithToken.http";

const API_KEY = "APIKEY_SECRET_abc123";
const CARD_TOKEN = "CARDTOKEN_SECRET_" + "9".repeat(24);
const ARGS = { subscriptionId: "sub1", amountAgorot: 3900, chargeId: "co-123", description: "מסלול סטנדרט · חודשי" };

let fetchMock: ReturnType<typeof vi.fn>;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

function okResponse(bodyObj: unknown): Response {
  return { status: 200, text: async () => JSON.stringify(bodyObj) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCreds.mockResolvedValue({ growSaasCustomerId: null, chargeToken: { reveal: () => CARD_TOKEN } });
  mocks.getApiKey.mockResolvedValue({ reveal: () => API_KEY });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  consoleSpies.forEach((s) => s.mockRestore());
});

describe("createGrowSaasTokenCharge (server→Grow createTransactionWithToken)", () => {
  it("success response is parsed → transport ok with paid fields", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "1", data: { statusCode: "2", transactionId: "tx1", asmachta: "appr1" } }));
    const r = await createGrowSaasTokenCharge(ARGS);
    expect(r).toEqual({ transport: "ok", status: "1", statusCode: "2", errId: null, transactionId: "tx1", approvalCode: "appr1" });
  });

  it("Grow err response is parsed → transport ok with errId", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "0", err: { id: 54, message: "missing paymentType" } }));
    const r = await createGrowSaasTokenCharge(ARGS);
    expect(r.transport).toBe("ok");
    if (r.transport === "ok") {
      expect(r.status).toBe("0");
      expect(r.errId).toBe(54);
      expect(r.statusCode).toBeNull();
    }
  });

  it("missing/purged token → token_missing (fetch never called)", async () => {
    mocks.getCreds.mockRejectedValue(new SecretNotFoundError("no stored token", { ownerType: "Subscription", rail: "A" }));
    const r = await createGrowSaasTokenCharge(ARGS);
    expect(r.transport).toBe("token_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("network error → network_error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect((await createGrowSaasTokenCharge(ARGS)).transport).toBe("network_error");
  });

  it("timeout (AbortError) → network_error with timeout reason", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);
    const r = await createGrowSaasTokenCharge(ARGS);
    expect(r.transport).toBe("network_error");
    if (r.transport === "network_error") expect(r.reason).toContain("timeout");
  });

  it("non-200 → network_error", async () => {
    fetchMock.mockResolvedValue({ status: 502, text: async () => "" } as unknown as Response);
    expect((await createGrowSaasTokenCharge(ARGS)).transport).toBe("network_error");
  });

  it("sends multipart with required charge fields: numeric UID, paymentType=2, paymentNum=1, UA set, no manual Content-Type", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "1", data: { statusCode: "2" } }));
    await createGrowSaasTokenCharge(ARGS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/createTransactionWithToken");
    expect(opts.method).toBe("POST");

    const headers = (opts.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).some((k) => k.toLowerCase() === "content-type")).toBe(false);
    expect(headers["User-Agent"]).toBeTruthy();

    const body = opts.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("apiKey")).toBe(API_KEY);
    expect(body.get("cardToken")).toBe(CARD_TOKEN);
    expect(body.get("paymentType")).toBe("2");
    expect(body.get("paymentNum")).toBe("1");
    expect(body.get("cField1")).toBe("saas_charge:co-123");
    expect(body.get("sum")).toBe("39.00");
    const uid = String(body.get("transactionUniqueIdentifier"));
    expect(uid).toMatch(/^[1-9][0-9]*$/);
    expect(Number(uid)).toBeLessThanOrEqual(2147483647);
  });

  it("never logs apiKey or cardToken", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "1", data: { statusCode: "2", transactionId: "tx1" } }));
    await createGrowSaasTokenCharge(ARGS);
    const logged = consoleSpies
      .flatMap((s) => s.mock.calls.flat())
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain(CARD_TOKEN);
  });
});
