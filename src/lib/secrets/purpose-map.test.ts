/**
 * Unit tests for src/lib/secrets/purpose-map.ts — validation rules R1–R3.
 *
 * The test exercises the map via its exported keys + string literals (the
 * functions accept `string`), so it asserts the canonical Purpose ↔ Rail ↔
 * ownerType table without re-deriving it.
 */

import { describe, it, expect } from "vitest";
import {
  SECRET_PURPOSE_MAP,
  isKnownPurpose,
  specForPurpose,
  assertPurposeRailOwner,
} from "./purpose-map";
import { SecretValidationError, SecretRailMismatchError } from "./errors";

const ALL_PURPOSES = Object.keys(SECRET_PURPOSE_MAP);

describe("isKnownPurpose (R1)", () => {
  it("accepts every mapped purpose", () => {
    for (const p of ALL_PURPOSES) expect(isKnownPurpose(p)).toBe(true);
  });
  it("rejects an unknown string", () => {
    expect(isKnownPurpose("NOT_A_PURPOSE")).toBe(false);
  });
  it("is not fooled by inherited Object properties", () => {
    expect(isKnownPurpose("toString")).toBe(false);
    expect(isKnownPurpose("constructor")).toBe(false);
  });
});

describe("specForPurpose (R1)", () => {
  it("returns the canonical spec for GROW_BROKER_API_KEY", () => {
    expect(specForPurpose("GROW_BROKER_API_KEY")).toEqual({
      rail: "B",
      ownerType: "GrowBrokerMerchant",
      ttlPolicy: "none",
    });
  });
  it("throws SecretValidationError for an unknown purpose", () => {
    expect(() => specForPurpose("bogus")).toThrow(SecretValidationError);
  });
});

describe("assertPurposeRailOwner (R1 + R2 + R3)", () => {
  it("passes when purpose/rail/ownerType are mutually consistent", () => {
    const spec = assertPurposeRailOwner({
      purpose: "GROW_SAAS_CHARGE_TOKEN",
      rail: "A",
      ownerType: "Subscription",
    });
    expect(spec.rail).toBe("A");
    expect(spec.ownerType).toBe("Subscription");
  });

  it("throws R2 (rail mismatch) as SecretRailMismatchError", () => {
    expect(() =>
      assertPurposeRailOwner({
        purpose: "GROW_BROKER_API_KEY", // canonical rail B
        rail: "A",
        ownerType: "GrowBrokerMerchant",
      }),
    ).toThrow(SecretRailMismatchError);
  });

  it("throws R3 (ownerType mismatch) as SecretValidationError", () => {
    expect(() =>
      assertPurposeRailOwner({
        purpose: "GROW_BROKER_API_KEY",
        rail: "B",
        ownerType: "Subscription", // wrong owner
      }),
    ).toThrow(SecretValidationError);
  });

  it("throws R1 (unknown purpose) before any rail check", () => {
    expect(() =>
      assertPurposeRailOwner({
        purpose: "UNKNOWN",
        rail: "B",
        ownerType: "GrowBrokerMerchant",
      }),
    ).toThrow(SecretValidationError);
  });

  it("every map entry validates against its own canonical rail/owner", () => {
    for (const [purpose, spec] of Object.entries(SECRET_PURPOSE_MAP)) {
      expect(() =>
        assertPurposeRailOwner({
          purpose,
          rail: spec.rail,
          ownerType: spec.ownerType,
        }),
      ).not.toThrow();
    }
  });
});
