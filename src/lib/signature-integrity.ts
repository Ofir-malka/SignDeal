/**
 * Signature Integrity Verification
 *
 * Provides tamper-evident cryptographic hashing for signed contracts.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * At signing time, the server calls generateSignatureDigest() with all fields
 * that were frozen the moment the client clicked "sign". The resulting 64-char
 * hex string is stored in Contract.signatureDigest in the same DB write that
 * transitions the contract to SIGNED — it is never updated afterward.
 *
 * To verify later, reload the Contract row (and its Client), reconstruct the
 * same SignatureDigestInput, and call verifySignatureIntegrity(). Any
 * post-signing mutation of contract content, signer details, timestamp, IP,
 * user-agent, or signature image will produce a different digest and return
 * status="INVALID".
 *
 * ── Canonical serialization ───────────────────────────────────────────────────
 *
 * JSON.stringify with a sorted key array is used so the canonical string is
 * identical regardless of object key insertion order or Node.js version.
 * All values are written as-is (no normalization beyond what the caller
 * provides) — callers must pass values exactly as they were stored.
 *
 * ── Backward compatibility ────────────────────────────────────────────────────
 *
 * Contracts signed before this system was deployed have signatureDigest = null.
 * verifySignatureIntegrity() returns status="LEGACY" for those rows — not
 * "INVALID". Downstream code should treat LEGACY as "unverifiable, not tampered".
 *
 * ── Relationship to signatureHash ─────────────────────────────────────────────
 *
 * Contract.signatureHash is an older, client-supplied SHA-256 of signatureData
 * only. It is not server-controlled and provides no tamper-evidence beyond the
 * image itself. signatureDigest supersedes it for integrity purposes; both
 * fields are preserved for backward compat.
 *
 * Uses Node.js built-in `crypto` — no external dependencies.
 */

import { createHash } from "crypto";

// ── Canonical payload ─────────────────────────────────────────────────────────
//
// Every field here was frozen at signing time. Changing any of them after
// signing will cause verifySignatureIntegrity() to return status="INVALID".
//
// Field ordering in the type is for readability only — canonicalize() sorts
// keys alphabetically before serialisation, so order does not affect the digest.

export interface SignatureDigestInput {
  // ── Contract identity ────────────────────────────────────────────────────────
  contractId: string;

  // ── Contract content (frozen at signing time) ────────────────────────────────
  contractType:    string;
  dealType:        string;       // "RENTAL" | "SALE" | "BOTH"
  propertyAddress: string;
  propertyCity:    string;
  propertyPrice:   number;       // agorot — integer
  commission:      number;       // agorot — integer
  commissionSale:  number | null; // null when dealType !== BOTH
  generatedText:   string | null; // template snapshot; null when no template used
  language:        string;       // "HE" | "EN" | "FR" | "RU" | "AR"

  // ── Signer details (final values after any in-flight client-info update) ─────
  clientName:      string;
  clientPhone:     string;
  clientEmail:     string;
  clientIdNumber:  string;

  // ── Signing event (all server-controlled) ────────────────────────────────────
  signedAt:        string;        // ISO 8601 — set by server, never from client body
  signatureIp:     string | null; // null when IP header absent (edge case)
  userAgent:       string | null; // null when User-Agent header absent
  signatureData:   string | null; // base64 PNG of drawn signature; null = no drawing
}

// ── Canonical serialization ───────────────────────────────────────────────────

/**
 * Deterministic JSON serialization with alphabetically sorted keys.
 * Ensures the same string is produced regardless of object key insertion order.
 */
function canonicalize(input: SignatureDigestInput): string {
  const sortedKeys = (Object.keys(input) as (keyof SignatureDigestInput)[]).sort();
  return JSON.stringify(input, sortedKeys);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic SHA-256 digest over the full signing context.
 *
 * Called server-side at signing time. The returned 64-char lowercase hex string
 * is stored in Contract.signatureDigest and never updated afterward.
 *
 * @param input  All fields frozen at signing time (see SignatureDigestInput).
 * @returns      64-char lowercase hex SHA-256 string.
 */
export function generateSignatureDigest(input: SignatureDigestInput): string {
  const canonical = canonicalize(input);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ── Verification ──────────────────────────────────────────────────────────────

/**
 * The possible outcomes of verifySignatureIntegrity().
 *
 *   VALID   — stored digest matches recomputed digest; data is untampered.
 *   INVALID — stored digest does not match; a field changed after signing.
 *   LEGACY  — no digest stored; contract was signed before this system existed.
 */
export type VerificationStatus = "VALID" | "INVALID" | "LEGACY";

export interface VerificationResult {
  /** High-level outcome. */
  status:          VerificationStatus;
  /** The digest read from Contract.signatureDigest (null for LEGACY). */
  storedDigest:    string | null;
  /**
   * The digest recomputed from current field values.
   * null for LEGACY (no computation performed).
   * Present for both VALID and INVALID so callers can log the mismatch.
   */
  computedDigest:  string | null;
  /** Human-readable summary suitable for audit logs. */
  message:         string;
}

/**
 * Verify the cryptographic integrity of a signed contract.
 *
 * Recomputes generateSignatureDigest(input) from current contract state and
 * compares it to the stored Contract.signatureDigest.
 *
 * Backward compatibility:
 *   storedDigest = null  →  LEGACY  (signed before digest system was deployed)
 *   storedDigest matches →  VALID
 *   storedDigest differs →  INVALID (data was modified after signing)
 *
 * @param input         Current contract state, reconstructed from the DB row.
 *                      Must use the same field values that were current at
 *                      signing time — read them fresh from the DB before calling.
 * @param storedDigest  Contract.signatureDigest from the DB row (may be null).
 */
export function verifySignatureIntegrity(
  input:        SignatureDigestInput,
  storedDigest: string | null,
): VerificationResult {
  // ── Legacy path — contract pre-dates this system ──────────────────────────
  if (storedDigest === null) {
    return {
      status:          "LEGACY",
      storedDigest:    null,
      computedDigest:  null,
      message:
        "No integrity digest stored — contract was signed before " +
        "signature integrity verification was enabled. Cannot verify.",
    };
  }

  // ── Recompute and compare ──────────────────────────────────────────────────
  const computedDigest = generateSignatureDigest(input);

  if (computedDigest === storedDigest) {
    return {
      status:         "VALID",
      storedDigest,
      computedDigest,
      message:        "Signature digest verified — contract data is untampered.",
    };
  }

  return {
    status:         "INVALID",
    storedDigest,
    computedDigest,
    message:
      "Signature digest mismatch — one or more signed fields were " +
      "modified after the contract was signed.",
  };
}
