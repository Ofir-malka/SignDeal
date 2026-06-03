/**
 * src/lib/secrets/revealable-secret.ts
 *
 * Branded, opaque wrapper around a decrypted secret string.
 *
 * The plaintext lives ONLY in a true `#private` field — it is never an own
 * enumerable property, so spread (`{...s}`), `Object.keys`, `Object.assign`, and
 * `JSON.stringify` cannot reach it. The single plaintext exit is `.reveal()`,
 * which is grep-able and ESLint-gated to the Grow HTTP adapter files (§7).
 *
 * Serialization is hostile by design:
 *   • toJSON()              → throws (JSON.stringify fails LOUD, even when nested)
 *   • [Symbol.toPrimitive]  → throws (blocks `${s}`, String(s), s + "")
 *   • toString()            → "[RevealableSecret]" (placeholder, does not throw)
 *   • [util.inspect.custom] → placeholder (console.log never prints the value)
 *
 * Detection brand: a well-known Symbol set as an OWN ENUMERABLE property, so
 * audit-sanitize can recognise a secret even on a prototype-stripped/degraded
 * copy (e.g. `{...secret}`) without importing this module. (A real
 * `structuredClone` drops both the prototype and symbol keys, but it also drops
 * the `#private` field, so no plaintext can survive that path either.)
 *
 * The constructor is not part of the feature surface; only Layer 1 (the accessor)
 * mints instances, and the ESLint import-boundary keeps `src/lib/secrets/**` out
 * of feature code.
 */

import { inspect } from "node:util";

/** Well-known brand. Truthy own-enumerable property → cross-module detectable. */
export const REVEALABLE_SECRET_BRAND = Symbol.for("signdeal.revealableSecret");

const PLACEHOLDER = "[RevealableSecret]";

export interface RevealableSecretInit {
  /** The decrypted secret value. Held privately; never exposed except via reveal(). */
  plaintext: string;
  /** Loggable handle (EncryptedSecret.id). Non-sensitive. */
  secretRef: string;
  /** SecretPurpose value. Non-sensitive. */
  purpose: string;
  /** "A" | "B". Non-sensitive. */
  rail: string;
}

export class RevealableSecret {
  /** Plaintext — TRUE private field. Not enumerable, not on the prototype. */
  readonly #plaintext: string;

  /** Non-sensitive metadata (safe to log). */
  readonly secretRef: string;
  readonly purpose: string;
  readonly rail: string;

  constructor(init: RevealableSecretInit) {
    this.#plaintext = init.plaintext;
    this.secretRef = init.secretRef;
    this.purpose = init.purpose;
    this.rail = init.rail;

    // Brand as an own, enumerable, non-writable property so it survives a
    // prototype-stripping spread/Object.assign and is detectable by sanitize.
    Object.defineProperty(this, REVEALABLE_SECRET_BRAND, {
      value: true,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }

  /**
   * The ONLY plaintext exit. Idempotent. MUST be used inline (passed straight
   * into the outbound HTTP arg) and only in Grow adapter files — enforced by the
   * `.reveal()` location lint rule. Never assign, log, store, return, or place
   * the result in an Error/Sentry context.
   */
  reveal(): string {
    return this.#plaintext;
  }

  /** JSON.stringify must fail loudly, even when nested in a larger object. */
  toJSON(): never {
    throw new Error(
      "RevealableSecret cannot be serialized to JSON (use .reveal() inline at the call site)",
    );
  }

  /** Block all primitive coercion: `${s}`, String(s), s + "", Number(s). */
  [Symbol.toPrimitive](): never {
    throw new Error("RevealableSecret cannot be coerced to a primitive");
  }

  /** Placeholder — does not throw (so accidental string contexts degrade safely). */
  toString(): string {
    return PLACEHOLDER;
  }

  /** console.log / util.inspect → placeholder with non-sensitive metadata only. */
  [inspect.custom](): string {
    return `[RevealableSecret purpose=${this.purpose} rail=${this.rail}]`;
  }
}

/**
 * Type guard usable without importing the class identity — matches the brand or
 * an instance. (Sanitize uses the brand check directly to avoid an import cycle.)
 */
export function isRevealableSecret(value: unknown): value is RevealableSecret {
  return (
    value instanceof RevealableSecret ||
    (typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[REVEALABLE_SECRET_BRAND] === true)
  );
}
