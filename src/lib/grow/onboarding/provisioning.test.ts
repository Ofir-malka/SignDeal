import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrowOnboardingStatus } from "@/generated/prisma";

// ── Mocked boundaries (Prisma + the Rail-B secret facade) ─────────────────────
const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  sessionUpdate: vi.fn(),
  storeBrokerGrowApiKey: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    growBrokerMerchant: { upsert: mocks.upsert },
    growOnboardingSession: { update: mocks.sessionUpdate },
  },
}));
vi.mock("@/lib/payments/secrets", () => ({ storeBrokerGrowApiKey: mocks.storeBrokerGrowApiKey }));

import { provisionMerchantPending } from "./provisioning";
import type { CanonicalOnboardingUpdate } from "./types";

const session = { id: "sess1", userId: "user1", status: GrowOnboardingStatus.LINK_ISSUED };

function update(partial: Partial<CanonicalOnboardingUpdate> = {}): CanonicalOnboardingUpdate {
  return {
    name: "Broker",
    phone: "0500000000",
    growUserId: "g1",
    packageId: "1997",
    packageName: "Pro",
    trackingCode: "TRK-9",
    businessTitle: "Test LTD",
    trackingStatus: { id: "3", message: "created" },
    statusRaw: "1",
    apiKey: null, // no seal in these cases
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Return an already-sealed merchant so the api_key seal step is skipped.
  mocks.upsert.mockResolvedValue({ id: "m1", apiKeySecretRef: "ref1" });
  mocks.sessionUpdate.mockResolvedValue({});
});

describe("provisionMerchantPending — persists Grow business metadata", () => {
  it("writes businessTitle + packageName in BOTH create and update", async () => {
    await provisionMerchantPending({ session, update: update() });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.upsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create.businessTitle).toBe("Test LTD");
    expect(arg.create.packageName).toBe("Pro");
    expect(arg.update.businessTitle).toBe("Test LTD");
    expect(arg.update.packageName).toBe("Pro");

    // Existing fields still persisted (unchanged behavior)
    expect(arg.create.growUserId).toBe("g1");
    expect(arg.create.trackingCode).toBe("TRK-9");
    expect(arg.create.packageId).toBe("1997");

    // isActive is set on create (false) and NEVER touched on update
    expect(arg.create.isActive).toBe(false);
    expect("isActive" in arg.update).toBe(false);
  });

  it("passes null when the callback omits the fields — old callbacks still work", async () => {
    await provisionMerchantPending({
      session,
      update: update({ businessTitle: null, packageName: null }),
    });
    const arg = mocks.upsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create.businessTitle).toBeNull();
    expect(arg.create.packageName).toBeNull();
    expect(arg.update.businessTitle).toBeNull();
    expect(arg.update.packageName).toBeNull();
    expect(arg.create.growUserId).toBe("g1"); // existing flow intact
  });
});
