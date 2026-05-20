/**
 * Contract Signature Integrity
 *
 * Canonical, tamper-evident SHA-256 digest over the immutable legal substance
 * of a signed contract. Used at signing time (to store the digest) and at
 * verification time (to recompute and compare).
 *
 * ── What is included in the digest ───────────────────────────────────────────
 *
 * Only fields that represent the legal substance of the agreement and were
 * frozen at the moment the client clicked "sign":
 *
 *   contractType    — agreement type (e.g. "INTERESTED_BUYER")
 *   dealType        — RENTAL | SALE | BOTH
 *   propertyAddress — full address string
 *   propertyCity    — city
 *   propertyPrice   — agreed price in agorot
 *   commission      — broker commission in agorot
 *   commissionSale  — sale-side commission in agorot (null when dealType ≠ BOTH)
 *   clientName      — signer's full name
 *   brokerFullName  — issuing broker's full name
 *   signedAt        — ISO 8601 timestamp set server-side at signing
 *
 * ── What is intentionally excluded ───────────────────────────────────────────
 *
 * Mutable operational fields that can change without altering the legal
 * agreement — including IP address, user-agent, reminder timestamps, sentAt,
 * openedAt, payment statuses, message IDs, webhook data, and generated text.
 * Including them would cause spurious INVALID results from routine operations.
 *
 * ── Backward compatibility ────────────────────────────────────────────────────
 *
 * Contracts where signatureDigest = null were signed before this system was
 * deployed. verifyContractIntegrity() returns { valid: false, tampered: false }
 * for those rows — callers should map null actualDigest to "NO_SIGNATURE_DIGEST"
 * rather than "CONTRACT_TAMPERED".
 *
 * ── Determinism ───────────────────────────────────────────────────────────────
 *
 * JSON.stringify with a sorted-key replacer array is used to ensure the
 * canonical string is identical regardless of JS object key insertion order.
 * Node.js built-in `crypto` — no external dependencies.
 */

import { createHash } from "crypto";

// ── Canonical input ───────────────────────────────────────────────────────────

/**
 * The set of fields that participate in the signature digest.
 * All values must be exactly as they were at the moment of signing.
 */
export interface SignatureDigestInput {
  contractType:    string;
  dealType:        string;        // "RENTAL" | "SALE" | "BOTH"
  propertyAddress: string;
  propertyCity:    string;
  propertyPrice:   number;        // agorot (integer)
  commission:      number;        // agorot (integer)
  commissionSale:  number | null; // agorot; null when dealType ≠ BOTH
  clientName:      string;        // signer's full name from Client.name
  brokerFullName:  string;        // issuing broker's name from User.fullName
  signedAt:        string;        // ISO 8601 — server-controlled, never from client body
}

// ── Minimum contract shape required by this module ───────────────────────────

/**
 * Minimum fields a contract object must expose for buildSignatureDigestInput().
 * Using a structural interface so both Prisma results and plain objects satisfy it.
 */
export interface ContractForDigest {
  contractType:    string;
  dealType:        string;
  propertyAddress: string;
  propertyCity:    string;
  propertyPrice:   number;
  commission:      number;
  commissionSale:  number | null;
  signedAt:        Date | null;
  client:          { name: string };
  user:            { fullName: string };
}

/**
 * Extends ContractForDigest with the stored digest field (for verification).
 */
export interface ContractForVerification extends ContractForDigest {
  signatureDigest: string | null;
}

// ── Verification result ───────────────────────────────────────────────────────

export interface ContractIntegrityResult {
  /** True only when actualDigest is present and matches expectedDigest. */
  valid:           boolean;
  /**
   * Digest recomputed from current contract state.
   * Always present so callers can log mismatches.
   */
  expectedDigest:  string;
  /**
   * Digest stored in Contract.signatureDigest.
   * null means the contract was signed before this system was deployed (LEGACY).
   */
  actualDigest:    string | null;
  /**
   * True when a digest is stored but does not match the recomputed one.
   * False for both VALID matches and LEGACY (null) rows.
   */
  tampered:        boolean;
}

// ── Canonical serialization ───────────────────────────────────────────────────

function canonicalize(input: SignatureDigestInput): string {
  // Sort keys alphabetically and pass as the replacer array.
  // This guarantees identical output regardless of insertion order.
  const sortedKeys = (
    Object.keys(input) as (keyof SignatureDigestInput)[]
  ).sort();
  return JSON.stringify(input, sortedKeys);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the canonical SignatureDigestInput from a contract that has its
 * client and user (broker) relations loaded.
 *
 * This is the single authoritative place that defines which fields enter the
 * digest — both signing and verification must call this function to guarantee
 * they use the same field set.
 *
 * @param contract  Contract with `client` and `user` relations included.
 */
export function buildSignatureDigestInput(
  contract: ContractForDigest,
): SignatureDigestInput {
  return {
    contractType:    contract.contractType,
    dealType:        contract.dealType,
    propertyAddress: contract.propertyAddress,
    propertyCity:    contract.propertyCity,
    propertyPrice:   contract.propertyPrice,
    commission:      contract.commission,
    commissionSale:  contract.commissionSale ?? null,
    clientName:      contract.client.name,
    brokerFullName:  contract.user.fullName,
    // signedAt must be the server-controlled timestamp.
    // At signing time callers pass { ...contract, signedAt: serverSignedAt }
    // so this reads the correct value in both paths.
    signedAt:        contract.signedAt?.toISOString() ?? "",
  };
}

/**
 * Compute a deterministic SHA-256 hex digest from a canonical SignatureDigestInput.
 *
 * Called server-side at signing time and again at verification time.
 * Returns a 64-char lowercase hex string.
 *
 * @param input  Built via buildSignatureDigestInput().
 */
export function generateSignatureDigest(input: SignatureDigestInput): string {
  return createHash("sha256")
    .update(canonicalize(input), "utf8")
    .digest("hex");
}

/**
 * Verify the cryptographic integrity of a signed contract.
 *
 * Rebuilds the digest from current contract state (via buildSignatureDigestInput)
 * and compares it against the stored Contract.signatureDigest.
 *
 * Results:
 *   valid=true,  tampered=false — digest matches; data is untampered
 *   valid=false, tampered=true  — digest present but wrong; data changed after signing
 *   valid=false, tampered=false — actualDigest is null; contract pre-dates this system
 *
 * @param contract  Contract with client, user, and signatureDigest loaded from DB.
 */
export function verifyContractIntegrity(
  contract: ContractForVerification,
): ContractIntegrityResult {
  const input          = buildSignatureDigestInput(contract);
  const expectedDigest = generateSignatureDigest(input);
  const actualDigest   = contract.signatureDigest;

  const valid    = actualDigest !== null && actualDigest === expectedDigest;
  const tampered = actualDigest !== null && actualDigest !== expectedDigest;

  return { valid, expectedDigest, actualDigest, tampered };
}
