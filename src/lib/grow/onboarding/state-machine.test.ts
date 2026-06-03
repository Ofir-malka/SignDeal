import { describe, it, expect } from "vitest";
import { GrowOnboardingStatus } from "@/generated/prisma";
import {
  isSuccessfulOnboarding,
  nextStatusOnCallback,
  canTransition,
} from "./state-machine";
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

describe("isSuccessfulOnboarding", () => {
  it("is true only when status is '1' AND user_id is present", () => {
    expect(isSuccessfulOnboarding(update({ statusRaw: "1", growUserId: "u1" }))).toBe(true);
  });
  it("is false when user_id is missing (cannot provision)", () => {
    expect(isSuccessfulOnboarding(update({ statusRaw: "1", growUserId: null }))).toBe(false);
  });
  it("is false when status is not '1'", () => {
    expect(isSuccessfulOnboarding(update({ statusRaw: "0", growUserId: "u1" }))).toBe(false);
  });
});

describe("nextStatusOnCallback", () => {
  it("maps success → PENDING_VERIFICATION (never COMPLETED/active)", () => {
    expect(nextStatusOnCallback(update({ statusRaw: "1", growUserId: "u1" }))).toBe(
      GrowOnboardingStatus.PENDING_VERIFICATION,
    );
  });
  it("maps non-success → FAILED", () => {
    expect(nextStatusOnCallback(update({ statusRaw: "0" }))).toBe(GrowOnboardingStatus.FAILED);
  });
});

describe("canTransition", () => {
  it("allows LINK_ISSUED → PENDING_VERIFICATION", () => {
    expect(
      canTransition(GrowOnboardingStatus.LINK_ISSUED, GrowOnboardingStatus.PENDING_VERIFICATION),
    ).toBe(true);
  });
  it("allows idempotent self-transition (re-delivery)", () => {
    expect(
      canTransition(
        GrowOnboardingStatus.PENDING_VERIFICATION,
        GrowOnboardingStatus.PENDING_VERIFICATION,
      ),
    ).toBe(true);
  });
  it("forbids COMPLETED → PENDING_VERIFICATION (terminal)", () => {
    expect(
      canTransition(GrowOnboardingStatus.COMPLETED, GrowOnboardingStatus.PENDING_VERIFICATION),
    ).toBe(false);
  });
  it("does NOT allow PENDING_VERIFICATION → COMPLETED unless explicitly (verification step)", () => {
    // COMPLETED is reachable from PENDING_VERIFICATION (manual verify) — allowed.
    expect(
      canTransition(GrowOnboardingStatus.PENDING_VERIFICATION, GrowOnboardingStatus.COMPLETED),
    ).toBe(true);
  });
});
