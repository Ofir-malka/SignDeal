import { describe, it, expect } from "vitest";
import { requiresRecovery, USE_RECOVERY_CODE, RECOVERY_PATH } from "./onboarding-eligibility";

describe("requiresRecovery", () => {
  it("blocks PAST_DUE (must recover)", () => {
    expect(requiresRecovery("PAST_DUE")).toBe(true);
  });
  it("allows upgrades / onboarding / re-subscribe (this pass = PAST_DUE only)", () => {
    for (const s of ["ACTIVE", "TRIALING", "INCOMPLETE", "EXPIRED", "CANCELED"]) {
      expect(requiresRecovery(s)).toBe(false);
    }
  });
  it("treats null/undefined (no subscription) as allowed", () => {
    expect(requiresRecovery(null)).toBe(false);
    expect(requiresRecovery(undefined)).toBe(false);
  });
});

describe("constants", () => {
  it("are the agreed values", () => {
    expect(USE_RECOVERY_CODE).toBe("USE_RECOVERY");
    expect(RECOVERY_PATH).toBe("/settings/billing/recover");
  });
});
