/**
 * Unit tests for the Rail A billing secret facade — focuses on the new platform
 * singleton (SignDeal's OWN Grow SaaS merchant API key). The Layer-1 accessor and
 * prisma are mocked, so these assert the facade always passes the correct rail/owner
 * tuple (rail "A", ownerType "Platform", ownerId "grow_saas", merchant purpose) and
 * resolves the singleton handle via the accessor (never prisma directly).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const subFindUnique = vi.fn();
  const subUpdate = vi.fn();
  // Sentinel tx handed to $transaction(run): lets us prove rotate + ref-update share one tx.
  const tx = { subscription: { findUnique: subFindUnique, update: subUpdate } };
  return {
    storeSecret: vi.fn(),
    readSecret: vi.fn(),
    findActiveSecretRef: vi.fn(),
    rotateSecret: vi.fn(),
    subFindUnique,
    subUpdate,
    tx,
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn(tx)),
  };
});

vi.mock("@/lib/secrets/accessor", () => ({
  storeSecret: mocks.storeSecret,
  readSecret: mocks.readSecret,
  findActiveSecretRef: mocks.findActiveSecretRef,
  rotateSecret: mocks.rotateSecret,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: mocks.subFindUnique, update: mocks.subUpdate },
    $transaction: mocks.transaction,
  },
}));

import { storeGrowSaasMerchantApiKey, getGrowSaasMerchantApiKey, rotateGrowSaasToken } from "./index";
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

describe("rotateGrowSaasToken (card-update / recovery)", () => {
  it("rotates the active token (rail A / Subscription / charge purpose) and re-points the ref", async () => {
    mocks.subFindUnique.mockResolvedValue({ growSaasChargeSecretRef: "oldRef" });
    mocks.rotateSecret.mockResolvedValue("newRef");

    const ref = await rotateGrowSaasToken({ subscriptionId: "sub1", plaintext: "newtok", reason: "card update" });

    expect(ref).toBe("newRef");
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // one transaction wraps the whole rotate
    expect(mocks.rotateSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secretRef: "oldRef",
        purpose: "GROW_SAAS_CHARGE_TOKEN",
        rail: "A",
        ownerType: "Subscription",
        ownerId: "sub1",
        newPlaintext: "newtok",
        reason: "card update",
      }),
      { tx: mocks.tx }, // SAME tx the ref-update runs on → rotate + ref-update are atomic
    );
    expect(mocks.subUpdate).toHaveBeenCalledWith({ where: { id: "sub1" }, data: { growSaasChargeSecretRef: "newRef" } });
    expect(mocks.storeSecret).not.toHaveBeenCalled();
  });

  it("falls back to a fresh store when no active token exists yet", async () => {
    mocks.subFindUnique.mockResolvedValue({ growSaasChargeSecretRef: null });
    mocks.storeSecret.mockResolvedValue("storedRef");

    const ref = await rotateGrowSaasToken({ subscriptionId: "sub1", plaintext: "tok", reason: "card update" });

    expect(ref).toBe("storedRef");
    expect(mocks.rotateSecret).not.toHaveBeenCalled();
    expect(mocks.storeSecret).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "GROW_SAAS_CHARGE_TOKEN", rail: "A", ownerType: "Subscription", ownerId: "sub1", plaintext: "tok" }),
      expect.anything(),
    );
  });

  it("self-heals a dangling ref (rotateSecret throws SecretNotFound) by sealing fresh", async () => {
    mocks.subFindUnique.mockResolvedValue({ growSaasChargeSecretRef: "danglingRef" });
    mocks.rotateSecret.mockRejectedValue(new SecretNotFoundError("gone", { ownerType: "Subscription", rail: "A" }));
    mocks.storeSecret.mockResolvedValue("healedRef");

    expect(await rotateGrowSaasToken({ subscriptionId: "sub1", plaintext: "tok", reason: "card update" })).toBe("healedRef");
  });

  it("throws SecretNotFoundError when the subscription is missing", async () => {
    mocks.subFindUnique.mockResolvedValue(null);
    await expect(rotateGrowSaasToken({ subscriptionId: "missing", plaintext: "t", reason: "r" }))
      .rejects.toBeInstanceOf(SecretNotFoundError);
  });

  it("composes with a caller tx (uses it; opens no nested $transaction)", async () => {
    const callerSub = {
      findUnique: vi.fn().mockResolvedValue({ growSaasChargeSecretRef: "oldRef" }),
      update: vi.fn(),
    };
    const callerTx = { subscription: callerSub };
    mocks.rotateSecret.mockResolvedValue("newRef");

    const ref = await rotateGrowSaasToken(
      { subscriptionId: "sub1", plaintext: "t", reason: "r" },
      { tx: callerTx as never },
    );

    expect(ref).toBe("newRef");
    expect(mocks.transaction).not.toHaveBeenCalled(); // reused the caller tx, opened none of our own
    expect(mocks.rotateSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: "oldRef" }),
      { tx: callerTx }, // rotate ran on the caller's tx
    );
    expect(callerSub.update).toHaveBeenCalledWith({ where: { id: "sub1" }, data: { growSaasChargeSecretRef: "newRef" } });
    expect(mocks.subFindUnique).not.toHaveBeenCalled(); // read ran on the caller tx, not base prisma
  });
});
