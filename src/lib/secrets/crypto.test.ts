/**
 * Unit tests for src/lib/secrets/crypto.ts
 *
 * Pure crypto (node:crypto) — no DB, no network. A pair of deterministic test
 * KEKs is injected via process.env in beforeAll; crypto.ts reads the KEK lazily
 * at call time, so setting env here is sufficient.
 *
 * Coverage:
 *   - round-trips arbitrary plaintext (ascii, unicode, empty, long)
 *   - a well-formed v1 envelope header is produced (offsets/lengths)
 *   - every encryption uses fresh nonces + a fresh wrapped DEK (no reuse)
 *   - AAD binds row identity: a blob decrypted under different params fails
 *   - tag/ciphertext tampering + truncation fail closed with SecretDecryptionError
 *   - KEK rotation re-wraps the DEK only: data bytes stay byte-identical, the
 *     plaintext still decrypts, and kekVersion is bumped
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  rewrapSecret,
  parseEnvelope,
  ENVELOPE_VERSION,
  type AadParams,
  type RewrapResult,
} from "./crypto";
import { SecretDecryptionError } from "./errors";

const KEK_1 = "11".repeat(32); // 64 hex chars → 32 bytes
const KEK_2 = "22".repeat(32);

const PARAMS: AadParams = {
  purpose: "GROW_BROKER_API_KEY",
  rail: "B",
  ownerType: "GrowBrokerMerchant",
  ownerId: "owner_123",
  secretRef: "cref0000000000000000000001",
};

let savedActive: string | undefined;
let savedKek1: string | undefined;
let savedKek2: string | undefined;

beforeAll(() => {
  savedActive = process.env.SECRET_KEK_ACTIVE;
  savedKek1 = process.env.SECRET_KEK_1;
  savedKek2 = process.env.SECRET_KEK_2;
  process.env.SECRET_KEK_ACTIVE = "1";
  process.env.SECRET_KEK_1 = KEK_1;
  process.env.SECRET_KEK_2 = KEK_2;
});

afterAll(() => {
  const restore = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  restore("SECRET_KEK_ACTIVE", savedActive);
  restore("SECRET_KEK_1", savedKek1);
  restore("SECRET_KEK_2", savedKek2);
});

describe("encryptSecret / decryptSecret round-trip", () => {
  it("round-trips an ASCII secret", () => {
    const { envelope, encVersion, kekVersion } = encryptSecret("hello-world", PARAMS);
    expect(encVersion).toBe(ENVELOPE_VERSION);
    expect(kekVersion).toBe(1);
    expect(decryptSecret(envelope, PARAMS)).toBe("hello-world");
  });

  it("round-trips a unicode secret", () => {
    const secret = "סוד-סודי-🔐-naïve";
    const { envelope } = encryptSecret(secret, PARAMS);
    expect(decryptSecret(envelope, PARAMS)).toBe(secret);
  });

  it("round-trips an empty string", () => {
    const { envelope } = encryptSecret("", PARAMS);
    expect(decryptSecret(envelope, PARAMS)).toBe("");
  });

  it("round-trips a long secret", () => {
    const secret = "x".repeat(10_000);
    const { envelope } = encryptSecret(secret, PARAMS);
    expect(decryptSecret(envelope, PARAMS)).toBe(secret);
  });

  it("produces a well-formed v1 envelope header", () => {
    const { envelope } = encryptSecret("abc", PARAMS);
    const parsed = parseEnvelope(envelope);
    expect(parsed.version).toBe(ENVELOPE_VERSION);
    expect(parsed.kekVersion).toBe(1);
    expect(parsed.nonceKek).toHaveLength(12);
    expect(parsed.tagKek).toHaveLength(16);
    expect(parsed.wrappedDek).toHaveLength(32);
    expect(parsed.nonceData).toHaveLength(12);
    expect(parsed.tagData).toHaveLength(16);
  });
});

describe("nonce / DEK uniqueness", () => {
  it("uses fresh nonces and a fresh wrapped DEK on every call", () => {
    const a = parseEnvelope(encryptSecret("same", PARAMS).envelope);
    const b = parseEnvelope(encryptSecret("same", PARAMS).envelope);
    expect(a.nonceKek.equals(b.nonceKek)).toBe(false);
    expect(a.nonceData.equals(b.nonceData)).toBe(false);
    expect(a.wrappedDek.equals(b.wrappedDek)).toBe(false);
    // Identical plaintext still yields different ciphertext (fresh DEK + nonce).
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });
});

describe("AAD binding (row identity)", () => {
  it("fails to decrypt under a different ownerId (transplant)", () => {
    const { envelope } = encryptSecret("bound", PARAMS);
    const other: AadParams = { ...PARAMS, ownerId: "owner_999" };
    expect(() => decryptSecret(envelope, other)).toThrow(SecretDecryptionError);
  });

  it("fails when secretRef differs", () => {
    const { envelope } = encryptSecret("bound", PARAMS);
    const other: AadParams = { ...PARAMS, secretRef: "cref0000000000000000000002" };
    expect(() => decryptSecret(envelope, other)).toThrow(SecretDecryptionError);
  });
});

describe("tamper resistance", () => {
  it("rejects a flipped ciphertext byte", () => {
    const { envelope } = encryptSecret("tamper-me", PARAMS);
    const bad = Buffer.from(envelope);
    bad[bad.length - 1] ^= 0xff; // flip last ciphertext byte
    expect(() => decryptSecret(bad, PARAMS)).toThrow(SecretDecryptionError);
  });

  it("rejects a flipped data-tag byte", () => {
    const { envelope } = encryptSecret("tamper-me", PARAMS);
    const bad = Buffer.from(envelope);
    bad[75] ^= 0xff; // OFF_TAG_DATA
    expect(() => decryptSecret(bad, PARAMS)).toThrow(SecretDecryptionError);
  });

  it("rejects a truncated envelope", () => {
    const { envelope } = encryptSecret("tamper-me", PARAMS);
    const bad = envelope.subarray(0, 50); // shorter than the 91-byte header
    expect(() => decryptSecret(bad, PARAMS)).toThrow(SecretDecryptionError);
  });
});

describe("KEK rotation (rewrap)", () => {
  it("re-wraps the DEK only: data bytes unchanged, plaintext recovered, kekVersion bumped", () => {
    const secret = "rotate-me";
    const { envelope } = encryptSecret(secret, PARAMS); // wrapped under KEK 1
    const before = parseEnvelope(envelope);
    expect(before.kekVersion).toBe(1);

    // Activate KEK 2, then rewrap (restore active KEK afterwards).
    process.env.SECRET_KEK_ACTIVE = "2";
    let rotated: RewrapResult;
    try {
      rotated = rewrapSecret(envelope, PARAMS);
    } finally {
      process.env.SECRET_KEK_ACTIVE = "1";
    }
    expect(rotated.kekVersion).toBe(2);

    const after = parseEnvelope(rotated.envelope);
    // Data half is byte-identical — the plaintext was never decrypted.
    expect(after.nonceData.equals(before.nonceData)).toBe(true);
    expect(after.tagData.equals(before.tagData)).toBe(true);
    expect(after.ciphertext.equals(before.ciphertext)).toBe(true);
    // Wrap half changed under the new KEK.
    expect(after.kekVersion).toBe(2);
    expect(after.nonceKek.equals(before.nonceKek)).toBe(false);
    expect(after.wrappedDek.equals(before.wrappedDek)).toBe(false);

    // Still decrypts: the rotated envelope carries kekVersion 2, KEK_2 is configured.
    expect(decryptSecret(rotated.envelope, PARAMS)).toBe(secret);
  });
});
