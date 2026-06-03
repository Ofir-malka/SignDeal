import { describe, it, expect, vi } from "vitest";

// correlation.ts imports the prisma client at module load; stub it so the pure
// buildDedupKey can be tested without a DB.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildDedupKey } from "./correlation";
import type { CanonicalOnboardingUpdate } from "./types";

function update(partial: Partial<CanonicalOnboardingUpdate>): CanonicalOnboardingUpdate {
  return {
    name: null,
    phone: null,
    growUserId: null,
    packageId: null,
    packageName: null,
    trackingCode: null,
    businessTitle: null,
    trackingStatus: null,
    statusRaw: null,
    apiKey: null,
    ...partial,
  };
}

describe("buildDedupKey", () => {
  it("is deterministic for the same logical callback", () => {
    const u = update({ trackingCode: "T1", growUserId: "u1", trackingStatus: { id: "3", message: "ok" }, statusRaw: "1" });
    expect(buildDedupKey(u)).toBe(buildDedupKey({ ...u }));
  });

  it("is NOT influenced by api_key (rule 9 — secret never part of identity)", () => {
    const base = update({ trackingCode: "T1", growUserId: "u1", statusRaw: "1" });
    const withSecret = update({ ...base, apiKey: "supersecret-value" });
    expect(buildDedupKey(withSecret)).toBe(buildDedupKey(base));
  });

  it("differs when the tracking code differs", () => {
    expect(buildDedupKey(update({ trackingCode: "T1" }))).not.toBe(
      buildDedupKey(update({ trackingCode: "T2" })),
    );
  });

  it("differs when the tracking status id differs (retry of a different state)", () => {
    const a = update({ growUserId: "u1", trackingStatus: { id: "3", message: "" } });
    const b = update({ growUserId: "u1", trackingStatus: { id: "9", message: "" } });
    expect(buildDedupKey(a)).not.toBe(buildDedupKey(b));
  });
});
