/**
 * Unit tests for sanitizeMetadata.
 *
 * No DB, no Prisma, no network — pure function tests.
 * Run with: npm test
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeMetadata,
  MAX_STRING_LENGTH,
  MAX_DEPTH,
  MAX_BREADTH,
  BLOCKED_KEY_SUBSTRINGS,
} from "./sanitize-metadata";
import { RevealableSecret } from "@/lib/secrets/revealable-secret";

// ── Blocked keys ───────────────────────────────────────────────────────────────

describe("blocked keys", () => {
  it("strips cardToken", () => {
    const result = sanitizeMetadata({ cardToken: "tok_abc123" });
    expect(result).not.toHaveProperty("cardToken");
  });

  it("strips chargeToken", () => {
    const result = sanitizeMetadata({ chargeToken: "ch_xyz" });
    expect(result).not.toHaveProperty("chargeToken");
  });

  it("strips hkId", () => {
    const result = sanitizeMetadata({ hkId: "hk_9999" });
    expect(result).not.toHaveProperty("hkId");
  });

  it("strips passwordHash", () => {
    const result = sanitizeMetadata({ passwordHash: "$2b$10$abc" });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("strips password", () => {
    const result = sanitizeMetadata({ password: "hunter2" });
    expect(result).not.toHaveProperty("password");
  });

  it("strips signatureToken", () => {
    const result = sanitizeMetadata({ signatureToken: "uuid-abc" });
    expect(result).not.toHaveProperty("signatureToken");
  });

  it("strips secret", () => {
    const result = sanitizeMetadata({ secret: "shh" });
    expect(result).not.toHaveProperty("secret");
  });

  it("strips apiKey", () => {
    const result = sanitizeMetadata({ apiKey: "sk_live_xxx" });
    expect(result).not.toHaveProperty("apiKey");
  });

  it("strips authToken", () => {
    const result = sanitizeMetadata({ authToken: "Bearer xyz" });
    expect(result).not.toHaveProperty("authToken");
  });

  it("strips token (generic)", () => {
    const result = sanitizeMetadata({ token: "t_123" });
    expect(result).not.toHaveProperty("token");
  });

  it("strips signatureData (base64 PNG)", () => {
    const result = sanitizeMetadata({ signatureData: "data:image/png;base64,ABC==" });
    expect(result).not.toHaveProperty("signatureData");
  });

  it("strips hypRaw", () => {
    const result = sanitizeMetadata({ hypRaw: '{"CCode":"0"}' });
    expect(result).not.toHaveProperty("hypRaw");
  });

  it("is case-insensitive on key names (CardToken, CARDTOKEN)", () => {
    const r1 = sanitizeMetadata({ CardToken: "x" });
    const r2 = sanitizeMetadata({ CARDTOKEN: "x" });
    expect(r1).not.toHaveProperty("CardToken");
    expect(r2).not.toHaveProperty("CARDTOKEN");
  });

  it("matches blocked substrings inside camelCase key names", () => {
    // "refreshToken" contains "token"
    const result = sanitizeMetadata({ refreshToken: "rt_abc" });
    expect(result).not.toHaveProperty("refreshToken");
  });

  it("preserves non-blocked keys", () => {
    const result = sanitizeMetadata({ contractType: "exclusive", plan: "STANDARD" });
    expect(result).toEqual({ contractType: "exclusive", plan: "STANDARD" });
  });

  it("preserves all BLOCKED_KEY_SUBSTRINGS are actually blocked", () => {
    // Verify that every entry in the exported blocklist is honoured
    for (const blocked of BLOCKED_KEY_SUBSTRINGS) {
      // Build a key that is exactly the blocked substring (already lower-case)
      const result = sanitizeMetadata({ [blocked]: "value" });
      expect(result, `key "${blocked}" should be stripped`).not.toHaveProperty(blocked);
    }
  });
});

// ── Israeli ID number ──────────────────────────────────────────────────────────

describe("idNumber redaction", () => {
  it("strips a 9-digit idNumber and sets _present flag", () => {
    const result = sanitizeMetadata({ idNumber: "123456789" });
    expect(result).not.toHaveProperty("idNumber");
    expect(result).toHaveProperty("idNumber_present", true);
  });

  it("does not trigger on 8-digit string (not an ID)", () => {
    const result = sanitizeMetadata({ someCode: "12345678" });
    expect(result).toHaveProperty("someCode", "12345678");
    expect(result).not.toHaveProperty("someCode_present");
  });

  it("does not trigger on 10-digit string", () => {
    const result = sanitizeMetadata({ someCode: "1234567890" });
    expect(result).toHaveProperty("someCode", "1234567890");
  });

  it("does not trigger on a 9-char non-digit string", () => {
    const result = sanitizeMetadata({ code: "abc123def" });
    expect(result).toHaveProperty("code", "abc123def");
  });
});

// ── Phone number redaction ─────────────────────────────────────────────────────

describe("phone number redaction", () => {
  it("redacts Israeli mobile number to last 4 digits", () => {
    const result = sanitizeMetadata({ phone: "0521234567" });
    expect(result).toHaveProperty("phone", "***4567");
  });

  it("redacts +972-prefixed phone", () => {
    const result = sanitizeMetadata({ phone: "+97252 123 4567" });
    // after replacing spaces: +972521234567 → last4 = 4567
    expect((result.phone as string)).toMatch(/\*\*\*\d{4}/);
  });

  it("keeps non-phone numeric strings unchanged", () => {
    const result = sanitizeMetadata({ amount: "12345" });
    expect(result).toHaveProperty("amount", "12345");
  });
});

// ── Email redaction ────────────────────────────────────────────────────────────

describe("email redaction", () => {
  it("replaces email with placeholder by default", () => {
    const result = sanitizeMetadata({ email: "broker@example.com" });
    expect(result).toHaveProperty("email", "[email redacted]");
  });

  it("keeps email when emailLoggingAllowed = true", () => {
    const result = sanitizeMetadata({ email: "admin@signdeal.co.il" }, true);
    expect(result).toHaveProperty("email", "admin@signdeal.co.il");
  });

  it("does not trigger on non-email strings", () => {
    const result = sanitizeMetadata({ label: "no-at-sign" });
    expect(result).toHaveProperty("label", "no-at-sign");
  });
});

// ── String truncation ──────────────────────────────────────────────────────────

describe("string truncation", () => {
  it(`truncates strings longer than MAX_STRING_LENGTH (${MAX_STRING_LENGTH})`, () => {
    const long = "a".repeat(MAX_STRING_LENGTH + 50);
    const result = sanitizeMetadata({ text: long });
    const value = result.text as string;
    expect(value.length).toBe(MAX_STRING_LENGTH + 1); // content + "…"
    expect(value.endsWith("…")).toBe(true);
  });

  it("does not truncate strings at exactly MAX_STRING_LENGTH", () => {
    const exact = "b".repeat(MAX_STRING_LENGTH);
    const result = sanitizeMetadata({ text: exact });
    expect(result.text).toBe(exact);
  });

  it("does not truncate short strings", () => {
    const result = sanitizeMetadata({ note: "short note" });
    expect(result.note).toBe("short note");
  });
});

// ── Recursive sanitization ────────────────────────────────────────────────────

describe("recursive sanitization", () => {
  it("strips blocked keys inside a nested object", () => {
    const result = sanitizeMetadata({
      outer: "ok",
      nested: {
        cardToken: "tok_secret",
        safe:      "value",
      },
    });
    const nested = result.nested as Record<string, unknown>;
    expect(nested).not.toHaveProperty("cardToken");
    expect(nested).toHaveProperty("safe", "value");
  });

  it("strips PII inside doubly-nested objects", () => {
    const result = sanitizeMetadata({
      level1: {
        level2: {
          idNumber: "987654321",
          label:    "ok",
        },
      },
    });
    const l2 = (result.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
    expect(l2).not.toHaveProperty("idNumber");
    expect(l2).toHaveProperty("idNumber_present", true);
    expect(l2).toHaveProperty("label", "ok");
  });

  it("strips blocked keys inside arrays of objects", () => {
    const result = sanitizeMetadata({
      items: [
        { id: "1", token: "tok_a" },
        { id: "2", plan:  "STANDARD" },
      ],
    });
    const items = result.items as Array<Record<string, unknown>>;
    expect(items[0]).not.toHaveProperty("token");
    expect(items[0]).toHaveProperty("id", "1");
    expect(items[1]).toHaveProperty("plan", "STANDARD");
  });

  it("handles arrays of primitive values without modification", () => {
    const result = sanitizeMetadata({ tags: ["a", "b", "c"] });
    expect(result.tags).toEqual(["a", "b", "c"]);
  });

  it("handles null values in objects", () => {
    const result = sanitizeMetadata({ entityId: null, plan: "PRO" });
    expect(result.entityId).toBeNull();
    expect(result.plan).toBe("PRO");
  });

  it("passes numbers and booleans through unchanged", () => {
    const result = sanitizeMetadata({ amount: 9900, active: true });
    expect(result.amount).toBe(9900);
    expect(result.active).toBe(true);
  });
});

// ── emailLoggingAllowed meta-key ──────────────────────────────────────────────

describe("emailLoggingAllowed meta-key", () => {
  it("propagates emailLoggingAllowed into nested objects", () => {
    const result = sanitizeMetadata(
      { nested: { email: "x@y.com" } },
      true,
    );
    const nested = result.nested as Record<string, unknown>;
    expect(nested).toHaveProperty("email", "x@y.com");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty object", () => {
    expect(sanitizeMetadata({})).toEqual({});
  });

  it("handles object where all keys are blocked", () => {
    const result = sanitizeMetadata({ cardToken: "x", token: "y", secret: "z" });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("does not mutate the original input object", () => {
    const input = { cardToken: "tok", plan: "STANDARD" };
    sanitizeMetadata(input);
    expect(input).toHaveProperty("cardToken", "tok"); // original untouched
  });
});

// ── RevealableSecret detection (Phase 1) ──────────────────────────────────────

describe("RevealableSecret redaction", () => {
  const makeSecret = () =>
    new RevealableSecret({
      plaintext: "live-token-abc",
      secretRef: "cref0000000000000000000001",
      purpose: "GROW_BROKER_API_KEY",
      rail: "B",
    });

  it("replaces a real RevealableSecret with [secret] before serialization", () => {
    const result = sanitizeMetadata({ payload: makeSecret() });
    expect(result.payload).toBe("[secret]");
  });

  it("replaces a prototype-stripped (spread) copy with [secret] via the brand", () => {
    const degraded = { ...makeSecret() }; // loses prototype + #private, keeps brand
    const result = sanitizeMetadata({ payload: degraded });
    expect(result.payload).toBe("[secret]");
  });

  it("never throws even though toJSON is hostile (brand check precedes serialization)", () => {
    expect(() => sanitizeMetadata({ a: { b: makeSecret() } })).not.toThrow();
  });
});

// ── Value-pattern masking (Phase 1) ───────────────────────────────────────────

describe("value-pattern masking", () => {
  it("masks a Luhn-valid PAN to ****last4", () => {
    const result = sanitizeMetadata({ pan: "4242424242424242" });
    expect(result.pan).toBe("****4242");
  });

  it("masks a PAN that contains spaces/dashes", () => {
    const result = sanitizeMetadata({ pan: "4242-4242 4242-4242" });
    expect(result.pan).toBe("****4242");
  });

  it("does not mask a 16-digit non-Luhn number", () => {
    const result = sanitizeMetadata({ ref: "4242424242424243" });
    expect(result.ref).toBe("4242424242424243");
  });

  it("redacts an Israeli IBAN", () => {
    const result = sanitizeMetadata({ acct: "IL123456789012345678901" });
    expect(result.acct).toBe("[iban redacted]");
  });

  it("redacts a long hex blob that contains a digit", () => {
    const hex = "a1".repeat(150); // 300 hex chars, contains digits
    const result = sanitizeMetadata({ blob: hex });
    expect(result.blob).toBe(`[redacted hex len=${hex.length}]`);
  });

  it("redacts a high-entropy opaque token", () => {
    const token = "aB3" + "xY7".repeat(13); // 42 chars: letters + digits, not hex-len
    const result = sanitizeMetadata({ tok: token });
    expect(result.tok as string).toMatch(/^\[redacted len=\d+\]$/);
  });

  it("preserves a short cuid-like handle (encRef, < 32 chars)", () => {
    const ref = "cref0000000000000000000001"; // 26 chars
    const result = sanitizeMetadata({ encRef: ref });
    expect(result.encRef).toBe(ref);
  });
});

// ── Non-JSON value coercions (Phase 1) ────────────────────────────────────────

describe("non-JSON value coercions", () => {
  it("redacts an ArrayBuffer as [bytes len=N]", () => {
    const result = sanitizeMetadata({ buf: new ArrayBuffer(8) });
    expect(result.buf).toBe("[bytes len=8]");
  });

  it("redacts a TypedArray as [bytes len=N]", () => {
    const result = sanitizeMetadata({ arr: new Uint8Array([1, 2, 3, 4]) });
    expect(result.arr).toBe("[bytes len=4]");
  });

  it("stringifies a bigint", () => {
    // BigInt() constructor (not the `n` literal) to stay below the ES2020 target.
    const result = sanitizeMetadata({ big: BigInt("123456789012345678901234567890") });
    expect(result.big).toBe("123456789012345678901234567890");
  });

  it("replaces a function with [unserializable]", () => {
    const result = sanitizeMetadata({ fn: () => 42 });
    expect(result.fn).toBe("[unserializable]");
  });

  it("replaces a symbol with [unserializable]", () => {
    const result = sanitizeMetadata({ sym: Symbol("x") });
    expect(result.sym).toBe("[unserializable]");
  });

  it("converts a Date to an ISO string", () => {
    const result = sanitizeMetadata({ when: new Date("2026-01-02T03:04:05.000Z") });
    expect(result.when).toBe("2026-01-02T03:04:05.000Z");
  });

  it("marks an invalid Date", () => {
    const result = sanitizeMetadata({ when: new Date("not-a-date") });
    expect(result.when).toBe("[invalid date]");
  });
});

// ── Hostile-input caps (Phase 1) ──────────────────────────────────────────────

describe("depth / breadth / cycle caps", () => {
  it("collapses nodes beyond MAX_DEPTH to [depth limit]", () => {
    let deep: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < MAX_DEPTH + 3; i++) deep = { nest: deep };
    const result = sanitizeMetadata(deep);
    expect(JSON.stringify(result)).toContain("[depth limit]");
  });

  it("breaks cycles with [circular]", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const result = sanitizeMetadata(a);
    expect(result.name).toBe("a");
    expect(result.self).toBe("[circular]");
  });

  it("caps array breadth and appends a +N more marker", () => {
    const big = Array.from({ length: MAX_BREADTH + 5 }, (_, i) => i);
    const result = sanitizeMetadata({ list: big });
    const list = result.list as unknown[];
    expect(list).toHaveLength(MAX_BREADTH + 1);
    expect(list[MAX_BREADTH]).toBe("[+5 more]");
  });

  it("caps object breadth with a [truncated] marker", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < MAX_BREADTH + 5; i++) wide[`k${i}`] = i;
    const result = sanitizeMetadata(wide);
    expect(result["[truncated]"]).toBe(true);
  });

  it("always returns a new tree (no shared references with the input)", () => {
    const input = { nested: { a: 1 }, list: [{ b: 2 }] };
    const result = sanitizeMetadata(input);
    expect(result).not.toBe(input);
    expect(result.nested).not.toBe(input.nested);
    expect(result.list).not.toBe(input.list);
  });
});

// ── Grow / payments blocked keys (Phase 1 additions) ──────────────────────────

describe("Grow/payments blocked keys", () => {
  it.each([
    "iban",
    "cvv",
    "cvc",
    "cardNumber",
    "accountNumber",
    "bankAccount",
    "branchNum",
    "swift",
    "routingNum",
    "authCode",
    "encryptedLead",
    "authorization",
    "bearer",
    "cookie",
    "setCookie",
  ])("strips %s", (key) => {
    const result = sanitizeMetadata({ [key]: "value" });
    expect(result).not.toHaveProperty(key);
  });
});
