/**
 * Unit tests for the Rail A billing secret facade — focuses on the new platform
 * singleton (SignDeal's OWN Grow SaaS merchant API key). The Layer-1 accessor and
 * prisma are mocked, so these assert the facade always passes the correct rail/owner
 * tuple (rail "A", ownerType "Platform", ownerId "grow_saas", merchant purpose) and
 * resolves the singleton handle via the accessor (never prisma directly).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  storeSecret: vi.fn(),
  readSecret: vi.fn(),
  findActiveSecretRef: vi.fn(),
}));

vi.mock("@/lib/secrets/accessor", () => ({
  storeSecret: mocks.storeSecret,
  readSecret: mocks.readSecret,
  findActiveSecretRef: mocks.findActiveSecretRef,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: (fn: (tx: unknown) => unknown) => fn({}),
  },
}));

import { storeGrowSaasMerchantApiKey, getGrowSaasMerchantApiKey } from "./index";
import { SecretNotFoundError } from "@/lib/secrets/errors";

beforeEach(() => vi.clearAllMocks());

describe("storeGrowSaasMerchantApiKey", () => {
  it("stores under rail A / Platform / grow_saas with the merchant purpose", async () => {
    mocks.storeSecret.mockResolvedValue("ref_platform_1");
    const ref = await storeGrowSaasMerchantApiKey({ plaintext: "k", reason: "init" });
    expect(ref).toBe("ref_platform_1");
    expect(mocks.storeSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "GROW_SAAS_MERCHANT_API_KEY",
        rail: "A",
        ownerType: "Platform",
        ownerId: "grow_saas",
        plaintext: "k",
        reason: "init",
      }),
    );
  });
});

describe("getGrowSaasMerchantApiKey", () => {
  it("throws SecretNotFoundError when no active platform secret exists", async () => {
    mocks.findActiveSecretRef.mockResolvedValue(null);
    await expect(getGrowSaasMerchantApiKey()).rejects.toBeInstanceOf(SecretNotFoundError);
    expect(mocks.readSecret).not.toHaveBeenCalled();
  });

  it("resolves the active handle by owner-tuple and reads it", async () => {
    mocks.findActiveSecretRef.mockResolvedValue("ref1");
    const secret = { reveal: () => "k" };
    mocks.readSecret.mockResolvedValue(secret);

    await expect(getGrowSaasMerchantApiKey()).resolves.toBe(secret);

    expect(mocks.findActiveSecretRef).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "GROW_SAAS_MERCHANT_API_KEY",
        rail: "A",
        ownerType: "Platform",
        ownerId: "grow_saas",
      }),
    );
    expect(mocks.readSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretRef: "ref1",
        purpose: "GROW_SAAS_MERCHANT_API_KEY",
        rail: "A",
        ownerType: "Platform",
        ownerId: "grow_saas",
      }),
    );
  });
});
