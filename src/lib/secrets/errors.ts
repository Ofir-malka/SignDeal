/**
 * src/lib/secrets/errors.ts
 *
 * Error taxonomy for the secret accessor (Phase 1 — Grow security foundation).
 *
 * INVARIANT: an error from this layer NEVER carries plaintext, ciphertext, DEK,
 * KEK, or any reversible hint of a secret value. Constructors accept only
 * non-sensitive routing context (purpose / rail / ownerType / a loggable `encRef`
 * handle). This keeps secrets out of stack traces, logs, and Sentry.
 *
 * `code` is a stable machine string for programmatic handling.
 * `retryable` is true ONLY for transient backend unavailability.
 */

/** Non-sensitive context safe to attach to a secret error. */
export interface SecretErrorContext {
  /** SecretPurpose enum value (non-sensitive). */
  purpose?: string;
  /** "A" | "B" (non-sensitive). */
  rail?: string;
  /** Owner model name, e.g. "Subscription" (non-sensitive). */
  ownerType?: string;
  /**
   * The loggable secret handle (EncryptedSecret.id). Named `encRef` so it never
   * trips the audit-sanitize `secret` blocklist substring. NEVER the value.
   */
  encRef?: string;
}

export abstract class SecretError extends Error {
  /** Stable machine-readable code. */
  abstract readonly code: string;
  /** Only transient/backend errors are retryable. */
  readonly retryable: boolean = false;
  /** Non-sensitive routing context. */
  readonly context: SecretErrorContext;

  protected constructor(message: string, context: SecretErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
    // Maintain prototype chain across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** R1/R3/R7 and other input-shape violations. */
export class SecretValidationError extends SecretError {
  readonly code = "SECRET_VALIDATION";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** R2: the `rail` argument does not match the purpose's canonical rail. */
export class SecretRailMismatchError extends SecretError {
  readonly code = "SECRET_RAIL_MISMATCH";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** R4: the stored row's owner does not match the caller's args. */
export class SecretOwnerMismatchError extends SecretError {
  readonly code = "SECRET_OWNER_MISMATCH";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** No row for the given handle (or it never existed). */
export class SecretNotFoundError extends SecretError {
  readonly code = "SECRET_NOT_FOUND";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** R6: the secret is past `expiresAt`. */
export class SecretExpiredError extends SecretError {
  readonly code = "SECRET_EXPIRED";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** R6: the secret has been crypto-shredded (tombstoned). */
export class SecretPurgedError extends SecretError {
  readonly code = "SECRET_PURGED";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** Single-active invariant violated: an active secret already exists for the tuple. */
export class SecretConflictError extends SecretError {
  readonly code = "SECRET_CONFLICT";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/**
 * AES-GCM authentication failed (wrap or data tag mismatch), or the envelope is
 * malformed. POSSIBLE TAMPERING — the accessor raises a critical Sentry alert
 * when this is thrown. Never a partial result.
 */
export class SecretDecryptionError extends SecretError {
  readonly code = "SECRET_DECRYPTION";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** A rotate/rewrap operation failed for a non-decryption reason. */
export class SecretRotationError extends SecretError {
  readonly code = "SECRET_ROTATION";
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}

/** Backend (KEK/KMS/Vault) transiently unavailable — the ONLY retryable error. */
export class SecretBackendUnavailableError extends SecretError {
  readonly code = "SECRET_BACKEND_UNAVAILABLE";
  readonly retryable = true;
  constructor(message: string, context?: SecretErrorContext) {
    super(message, context);
  }
}
