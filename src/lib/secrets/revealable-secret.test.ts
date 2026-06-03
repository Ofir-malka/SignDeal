/**
 * Unit tests for src/lib/secrets/revealable-secret.ts
 *
 * Verifies the wrapper is hostile to every accidental-exfiltration path —
 * JSON, primitive coercion, spread/keys, console/inspect — while .reveal()
 * remains the single explicit plaintext exit, and the detection brand survives
 * a prototype-stripping copy.
 */

import { describe, it, expect } from "vitest";
import { inspect } from "node:util";
import {
  RevealableSecret,
  REVEALABLE_SECRET_BRAND,
  isRevealableSecret,
} from "./revealable-secret";

const PLAINTEXT = "super-secret-value-1234567890";

function make(): RevealableSecret {
  return new RevealableSecret({
    plaintext: PLAINTEXT,
    secretRef: "cref0000000000000000000001",
    purpose: "GROW_BROKER_API_KEY",
    rail: "B",
  });
}

describe("reveal()", () => {
  it("returns the plaintext (the single exit)", () => {
    expect(make().reveal()).toBe(PLAINTEXT);
  });
  it("is idempotent", () => {
    const s = make();
    expect(s.reveal()).toBe(s.reveal());
  });
});

describe("hostile serialization", () => {
  it("throws on JSON.stringify (direct)", () => {
    expect(() => JSON.stringify(make())).toThrow();
  });
  it("throws on JSON.stringify when nested", () => {
    expect(() => JSON.stringify({ a: { b: make() } })).toThrow();
  });
  it("throws on String() coercion", () => {
    expect(() => String(make())).toThrow();
  });
  it("throws on template-literal coercion", () => {
    const s = make();
    expect(() => `${s}`).toThrow();
  });
  it("throws on numeric/concat coercion", () => {
    const s = make();
    expect(() => (s as unknown as number) + 1).toThrow();
  });
});

describe("non-throwing safe surfaces never leak plaintext", () => {
  it("toString() returns a placeholder", () => {
    expect(make().toString()).toBe("[RevealableSecret]");
  });
  it("util.inspect shows metadata only, never the plaintext", () => {
    const out = inspect(make());
    expect(out).toContain("RevealableSecret");
    expect(out).not.toContain(PLAINTEXT);
  });
  it("the plaintext is not an own enumerable property", () => {
    const s = make();
    expect(Object.keys(s)).not.toContain("plaintext");
    expect(JSON.stringify(Object.keys(s))).not.toContain(PLAINTEXT);
  });
  it("spread copies metadata + brand but not the plaintext", () => {
    const copy = { ...make() } as Record<string | symbol, unknown>;
    expect(Object.values(copy)).not.toContain(PLAINTEXT);
    expect(copy[REVEALABLE_SECRET_BRAND]).toBe(true);
  });
  it("exposes only non-sensitive metadata fields", () => {
    const s = make();
    expect(s.secretRef).toBe("cref0000000000000000000001");
    expect(s.purpose).toBe("GROW_BROKER_API_KEY");
    expect(s.rail).toBe("B");
  });
});

describe("brand detection", () => {
  it("detects a real instance", () => {
    expect(isRevealableSecret(make())).toBe(true);
  });
  it("detects a prototype-stripped (spread) copy via the brand", () => {
    const copy = { ...make() };
    expect(isRevealableSecret(copy)).toBe(true);
  });
  it("rejects a plain object", () => {
    expect(isRevealableSecret({ purpose: "x" })).toBe(false);
  });
  it("rejects null / primitives", () => {
    expect(isRevealableSecret(null)).toBe(false);
    expect(isRevealableSecret("string")).toBe(false);
    expect(isRevealableSecret(42)).toBe(false);
  });
});
