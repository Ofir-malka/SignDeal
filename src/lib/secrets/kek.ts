/**
 * src/lib/secrets/kek.ts
 *
 * Key-Encryption-Key (KEK) access — the wrapping key for per-record DEKs.
 *
 * EXPOSURE CONTROLS (all mandatory):
 *   • Server-only. The `server-only` package is not installed in this repo, so a
 *     runtime guard throws if this module is ever evaluated in a browser bundle.
 *     The ESLint import-boundary additionally forbids importing this module (and
 *     all of src/lib/secrets/**) from middleware / edge-runtime files.
 *   • Never NEXT_PUBLIC_*. KEKs are read only from server env names SECRET_KEK_*.
 *   • Excluded from logs/Sentry. This module logs nothing and exposes no value;
 *     callers must never log the returned Buffer.
 *
 * VERSIONING (for zero-downtime rotation):
 *   SECRET_KEK_ACTIVE = <n>     → the version new writes wrap under
 *   SECRET_KEK_<n>    = <key>   → 256-bit key material (hex-64 or base64/url)
 *   SECRET_KEK_<n-1>  = <key>   → kept until the rewrap job finishes (reads only)
 *
 * LAZINESS: every read hits process.env at CALL time (never import time), so a
 * build with no KEK configured does not fail; only an actual encrypt/decrypt does.
 */

import { SecretValidationError } from "./errors";

// Runtime server guard (stand-in for `import "server-only"`).
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/secrets/kek.ts was loaded in a browser context. KEK material is server-only.",
  );
}

const KEK_BYTES = 32; // AES-256
const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** Read and validate SECRET_KEK_ACTIVE → integer version. */
export function getActiveKekVersion(): number {
  const raw = process.env.SECRET_KEK_ACTIVE;
  if (!raw || raw.trim() === "") {
    throw new SecretValidationError(
      "SECRET_KEK_ACTIVE is not configured (server env)",
    );
  }
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 0 || version > 65535) {
    throw new SecretValidationError(
      "SECRET_KEK_ACTIVE must be an integer in [0, 65535]",
    );
  }
  return version;
}

/**
 * Read and decode the KEK for a specific version → 32-byte Buffer.
 * Accepts hex (64 chars) or base64 / base64url; must decode to exactly 32 bytes.
 * Throws (no value in the message) if absent or wrong length.
 */
export function getKek(version: number): Buffer {
  const raw = process.env[`SECRET_KEK_${version}`];
  if (!raw || raw.trim() === "") {
    throw new SecretValidationError(
      `KEK version ${version} is not configured (SECRET_KEK_${version} missing)`,
    );
  }
  const trimmed = raw.trim();

  let key: Buffer;
  if (HEX_64.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    // base64 / base64url — Node's base64 decoder also accepts base64url alphabet.
    key = Buffer.from(trimmed, "base64");
  }

  if (key.length !== KEK_BYTES) {
    throw new SecretValidationError(
      `KEK version ${version} must decode to ${KEK_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

/** The KEK new writes should wrap under. */
export function getActiveKek(): { version: number; key: Buffer } {
  const version = getActiveKekVersion();
  return { version, key: getKek(version) };
}
