/**
 * src/lib/secrets/crypto.ts  — Layer 0 (crypto/backend strategy)
 *
 * Envelope encryption with AES-256-GCM (node:crypto, no new dependency).
 * Plaintext is encrypted under a per-record DEK; the DEK is wrapped by the KEK.
 * Two independent GCM operations, each with its own fresh random 96-bit nonce and
 * 128-bit tag. Nonces are never reused and never derived from data.
 *
 * Self-describing envelope (the EncryptedSecret.ciphertext BYTEA column):
 *
 *   offset size  field        notes
 *   0      1     version      = 0x01 (mirrors encVersion column)
 *   1      2     kekVersion   uint16 BE (mirrors kekVersion column)
 *   3      12    nonce_kek    CSPRNG, unique per wrap
 *   15     16    tag_kek      GCM tag of the DEK-wrap
 *   31     32    wrappedDek   AES-256-GCM(KEK, DEK, nonce_kek, AAD_wrap)
 *   63     12    nonce_data   CSPRNG, unique per encryption
 *   75     16    tag_data     GCM tag of the data
 *   91     N     ciphertext   AES-256-GCM(DEK, plaintext, nonce_data, AAD_data)
 *
 * AAD (length-prefixed, LP(x) = uint16 len || utf8(x)) binds each ciphertext to
 * its row identity so a blob copied into another row fails GCM verification:
 *   AAD_data = LP(purpose)·LP(rail)·LP(ownerType)·LP(ownerId)·LP(secretRef)·LP(encVersion)
 *   AAD_wrap = LP(purpose)·LP(rail)·LP(ownerType)·LP(ownerId)·LP(secretRef)·LP(kekVersion)
 * AAD_data deliberately EXCLUDES kekVersion → KEK rotation re-wraps only the DEK
 * without ever decrypting the secret. AAD_wrap INCLUDES it → anti-downgrade.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getActiveKek, getKek } from "./kek";
import { SecretDecryptionError } from "./errors";

export const ENVELOPE_VERSION = 1;

const NONCE_BYTES = 12; // 96-bit GCM nonce
const TAG_BYTES = 16; // 128-bit GCM tag
const DEK_BYTES = 32; // AES-256 data key
const ALGO = "aes-256-gcm";

// Envelope field offsets.
const OFF_VERSION = 0;
const OFF_KEKVER = 1;
const OFF_NONCE_KEK = 3;
const OFF_TAG_KEK = 15;
const OFF_WRAPPED_DEK = 31;
const OFF_NONCE_DATA = 63;
const OFF_TAG_DATA = 75;
const OFF_CIPHERTEXT = 91;
const HEADER_BYTES = OFF_CIPHERTEXT;

/** Routing identity bound into the AAD. All fields are non-sensitive. */
export interface AadParams {
  purpose: string;
  rail: string;
  ownerType: string;
  ownerId: string;
  /** EncryptedSecret.id — generated before encryption (§4). */
  secretRef: string;
}

// ── AAD construction ────────────────────────────────────────────────────────

function lp(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  const len = Buffer.allocUnsafe(2);
  len.writeUInt16BE(body.length, 0);
  return Buffer.concat([len, body]);
}

function aadBase(p: AadParams): Buffer {
  return Buffer.concat([
    lp(p.purpose),
    lp(p.rail),
    lp(p.ownerType),
    lp(p.ownerId),
    lp(p.secretRef),
  ]);
}

function buildAadData(p: AadParams, encVersion: number): Buffer {
  return Buffer.concat([aadBase(p), lp(String(encVersion))]);
}

function buildAadWrap(p: AadParams, kekVersion: number): Buffer {
  return Buffer.concat([aadBase(p), lp(String(kekVersion))]);
}

// ── Envelope parse ──────────────────────────────────────────────────────────

export interface ParsedEnvelope {
  version: number;
  kekVersion: number;
  nonceKek: Buffer;
  tagKek: Buffer;
  wrappedDek: Buffer;
  nonceData: Buffer;
  tagData: Buffer;
  ciphertext: Buffer;
}

export function parseEnvelope(envelope: Buffer): ParsedEnvelope {
  if (envelope.length < HEADER_BYTES) {
    throw new SecretDecryptionError("Envelope is too short / malformed");
  }
  const version = envelope.readUInt8(OFF_VERSION);
  if (version !== ENVELOPE_VERSION) {
    throw new SecretDecryptionError(
      `Unsupported envelope version ${version}`,
    );
  }
  return {
    version,
    kekVersion: envelope.readUInt16BE(OFF_KEKVER),
    nonceKek: envelope.subarray(OFF_NONCE_KEK, OFF_TAG_KEK),
    tagKek: envelope.subarray(OFF_TAG_KEK, OFF_WRAPPED_DEK),
    wrappedDek: envelope.subarray(OFF_WRAPPED_DEK, OFF_NONCE_DATA),
    nonceData: envelope.subarray(OFF_NONCE_DATA, OFF_TAG_DATA),
    tagData: envelope.subarray(OFF_TAG_DATA, OFF_CIPHERTEXT),
    ciphertext: envelope.subarray(OFF_CIPHERTEXT),
  };
}

function assemble(parts: {
  kekVersion: number;
  nonceKek: Buffer;
  tagKek: Buffer;
  wrappedDek: Buffer;
  nonceData: Buffer;
  tagData: Buffer;
  ciphertext: Buffer;
}): Buffer {
  const head = Buffer.allocUnsafe(HEADER_BYTES);
  head.writeUInt8(ENVELOPE_VERSION, OFF_VERSION);
  head.writeUInt16BE(parts.kekVersion, OFF_KEKVER);
  parts.nonceKek.copy(head, OFF_NONCE_KEK);
  parts.tagKek.copy(head, OFF_TAG_KEK);
  parts.wrappedDek.copy(head, OFF_WRAPPED_DEK);
  parts.nonceData.copy(head, OFF_NONCE_DATA);
  parts.tagData.copy(head, OFF_TAG_DATA);
  return Buffer.concat([head, parts.ciphertext]);
}

// ── Public crypto API ───────────────────────────────────────────────────────

export interface EncryptResult {
  envelope: Buffer;
  encVersion: number;
  kekVersion: number;
}

/** Wrap a fresh DEK under the active KEK, encrypt plaintext under the DEK. */
export function encryptSecret(plaintext: string, params: AadParams): EncryptResult {
  const { version: kekVersion, key: kek } = getActiveKek();

  // Wrap the DEK.
  const dek = randomBytes(DEK_BYTES);
  const nonceKek = randomBytes(NONCE_BYTES);
  const wrapCipher = createCipheriv(ALGO, kek, nonceKek, { authTagLength: TAG_BYTES });
  wrapCipher.setAAD(buildAadWrap(params, kekVersion));
  const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
  const tagKek = wrapCipher.getAuthTag();

  // Encrypt the data.
  const nonceData = randomBytes(NONCE_BYTES);
  const dataCipher = createCipheriv(ALGO, dek, nonceData, { authTagLength: TAG_BYTES });
  dataCipher.setAAD(buildAadData(params, ENVELOPE_VERSION));
  const ciphertext = Buffer.concat([
    dataCipher.update(Buffer.from(plaintext, "utf8")),
    dataCipher.final(),
  ]);
  const tagData = dataCipher.getAuthTag();

  const envelope = assemble({
    kekVersion,
    nonceKek,
    tagKek,
    wrappedDek,
    nonceData,
    tagData,
    ciphertext,
  });

  return { envelope, encVersion: ENVELOPE_VERSION, kekVersion };
}

/** Unwrap the DEK (verifying AAD_wrap), then decrypt the data (verifying AAD_data). */
export function decryptSecret(envelope: Buffer, params: AadParams): string {
  const parsed = parseEnvelope(envelope);
  const kek = getKek(parsed.kekVersion); // config error if missing (not a tamper alert)

  let dek: Buffer;
  try {
    const wrapDecipher = createDecipheriv(ALGO, kek, parsed.nonceKek, {
      authTagLength: TAG_BYTES,
    });
    wrapDecipher.setAAD(buildAadWrap(params, parsed.kekVersion));
    wrapDecipher.setAuthTag(parsed.tagKek);
    dek = Buffer.concat([wrapDecipher.update(parsed.wrappedDek), wrapDecipher.final()]);
  } catch {
    throw new SecretDecryptionError("DEK unwrap failed (KEK AAD/tag mismatch)", {
      encRef: params.secretRef,
      purpose: params.purpose,
      rail: params.rail,
      ownerType: params.ownerType,
    });
  }

  try {
    const dataDecipher = createDecipheriv(ALGO, dek, parsed.nonceData, {
      authTagLength: TAG_BYTES,
    });
    dataDecipher.setAAD(buildAadData(params, parsed.version));
    dataDecipher.setAuthTag(parsed.tagData);
    const plaintext = Buffer.concat([
      dataDecipher.update(parsed.ciphertext),
      dataDecipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new SecretDecryptionError("Data decryption failed (data AAD/tag mismatch)", {
      encRef: params.secretRef,
      purpose: params.purpose,
      rail: params.rail,
      ownerType: params.ownerType,
    });
  } finally {
    dek.fill(0); // best-effort scrub of the unwrapped DEK
  }
}

export interface RewrapResult {
  envelope: Buffer;
  kekVersion: number;
}

/**
 * KEK-rotation primitive (§3.2): unwrap ONLY the DEK with its stored KEK, then
 * re-wrap it under the active KEK with a fresh nonce_kek/tag_kek/kekVersion. The
 * data ciphertext, nonce_data, tag_data and AAD_data are untouched — the secret
 * plaintext is NEVER decrypted, and secretRef stays valid.
 */
export function rewrapSecret(envelope: Buffer, params: AadParams): RewrapResult {
  const parsed = parseEnvelope(envelope);
  const oldKek = getKek(parsed.kekVersion);

  let dek: Buffer;
  try {
    const wrapDecipher = createDecipheriv(ALGO, oldKek, parsed.nonceKek, {
      authTagLength: TAG_BYTES,
    });
    wrapDecipher.setAAD(buildAadWrap(params, parsed.kekVersion));
    wrapDecipher.setAuthTag(parsed.tagKek);
    dek = Buffer.concat([wrapDecipher.update(parsed.wrappedDek), wrapDecipher.final()]);
  } catch {
    throw new SecretDecryptionError("DEK unwrap failed during rewrap", {
      encRef: params.secretRef,
      purpose: params.purpose,
      rail: params.rail,
      ownerType: params.ownerType,
    });
  }

  try {
    const { version: newKekVersion, key: newKek } = getActiveKek();
    const newNonceKek = randomBytes(NONCE_BYTES);
    const wrapCipher = createCipheriv(ALGO, newKek, newNonceKek, {
      authTagLength: TAG_BYTES,
    });
    wrapCipher.setAAD(buildAadWrap(params, newKekVersion));
    const newWrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const newTagKek = wrapCipher.getAuthTag();

    const newEnvelope = assemble({
      kekVersion: newKekVersion,
      nonceKek: newNonceKek,
      tagKek: newTagKek,
      wrappedDek: newWrappedDek,
      nonceData: parsed.nonceData, // unchanged
      tagData: parsed.tagData, // unchanged
      ciphertext: parsed.ciphertext, // unchanged — plaintext never touched
    });
    return { envelope: newEnvelope, kekVersion: newKekVersion };
  } finally {
    dek.fill(0);
  }
}
