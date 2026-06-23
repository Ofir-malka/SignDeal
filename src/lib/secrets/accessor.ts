/**
 * src/lib/secrets/accessor.ts  — Layer 1 (generic, PRIVILEGED)
 *
 * The only code that touches the EncryptedSecret table and the crypto layer.
 * NOT feature-importable: the ESLint import-boundary restricts src/lib/secrets/**
 * to itself plus the two Layer 2 rail modules (payments/secrets, billing/secrets).
 * Feature code uses the Layer 2 functions, never these.
 *
 * Implements validation rules:
 *   R1 purpose is a known enum                       (purpose-map)
 *   R2 rail arg == purpose's canonical rail          (purpose-map)
 *   R3 ownerType == purpose's canonical ownerType    (purpose-map)
 *   R4 stored row's purpose/rail/ownerType/ownerId == args   (here)
 *   R6 expired/purged secrets unreadable; only rotate(rewrap)/purge touch a
 *      purged row; purge is idempotent                        (here)
 *   R7 empty plaintext rejected                               (here)
 * (R5 — a Layer 2 module pins one rail constant — is enforced by Layer 2 + lint.)
 *
 * Single-active invariant: at most one non-purged row per
 * (ownerType, ownerId, purpose), enforced by the partial unique index
 * (authoritative) and a friendly in-transaction pre-check.
 */

import { Prisma, type PrismaClient, type SecretPurpose } from "@/generated/prisma";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import {
  encryptSecret,
  decryptSecret,
  rewrapSecret,
  type AadParams,
} from "./crypto";
import { generateSecretId } from "./ids";
import { assertPurposeRailOwner } from "./purpose-map";
import { RevealableSecret } from "./revealable-secret";
import {
  SecretValidationError,
  SecretRailMismatchError,
  SecretOwnerMismatchError,
  SecretNotFoundError,
  SecretExpiredError,
  SecretPurgedError,
  SecretConflictError,
  SecretDecryptionError,
} from "./errors";

type SecretDb = PrismaClient | Prisma.TransactionClient;

const ENTITY_TYPE = "encryptedSecret";

/**
 * Prisma's Bytes column wants `Uint8Array<ArrayBuffer>`; Node Buffers are
 * `Uint8Array<ArrayBufferLike>`. Copy into a plain-ArrayBuffer-backed view.
 * Secrets are tiny, so the copy cost is negligible.
 */
function toBytes(b: Buffer): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(b);
}

// ── Shared helpers ──────────────────────────────────────────────────────────

interface OwnerIdentity {
  secretRef: string;
  purpose: string;
  rail: string;
  ownerType: string;
  ownerId: string;
}

/** R4: the stored row must match every routing field the caller supplied. */
function assertStoredRowMatches(
  row: { purpose: string; rail: string; ownerType: string; ownerId: string },
  args: OwnerIdentity,
): void {
  if (row.rail !== args.rail) {
    throw new SecretRailMismatchError("stored row rail does not match args", {
      encRef: args.secretRef,
      purpose: args.purpose,
      rail: args.rail,
    });
  }
  if (
    row.purpose !== args.purpose ||
    row.ownerType !== args.ownerType ||
    row.ownerId !== args.ownerId
  ) {
    throw new SecretOwnerMismatchError("stored row owner does not match args", {
      encRef: args.secretRef,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
    });
  }
}

/** Fire a critical, security-tagged alert for a possible-tampering event. */
function alertDecryption(err: unknown, args: OwnerIdentity): void {
  Sentry.captureException(err, {
    level: "fatal",
    tags: { component: "secret_crypto", security: "true" },
    extra: {
      encRef: args.secretRef,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
    },
  });
  void logAuditEvent({
    userId: null,
    action: "secret.decryption_failed",
    entityType: ENTITY_TYPE,
    entityId: args.secretRef,
    metadata: {
      encRef: args.secretRef,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
    },
  });
}

// ── storeSecret ─────────────────────────────────────────────────────────────

export interface StoreSecretArgs {
  purpose: string;
  rail: string;
  ownerType: string;
  ownerId: string;
  plaintext: string;
  expiresAt?: Date | null;
  /** Reserved for future dedupe (ES-3 fingerprint OFF in Phase 1). */
  idempotencyKey?: string;
  reason?: string;
}

/**
 * Encrypt + persist a new secret. Generates the id BEFORE encryption (so it can
 * be bound into the AAD), then inserts under the single-active invariant.
 * Returns the SecretRef (the row id). Optionally participates in a caller txn.
 */
export async function storeSecret(
  args: StoreSecretArgs,
  opts?: { tx?: Prisma.TransactionClient },
): Promise<string> {
  assertPurposeRailOwner(args); // R1/R2/R3
  if (typeof args.plaintext !== "string" || args.plaintext.length === 0) {
    throw new SecretValidationError("plaintext must be a non-empty string", {
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
    }); // R7
  }

  const secretRef = generateSecretId();
  const aad: AadParams = {
    purpose: args.purpose,
    rail: args.rail,
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    secretRef,
  };
  const { envelope, encVersion, kekVersion } = encryptSecret(args.plaintext, aad);

  const run = async (db: SecretDb): Promise<string> => {
    const existing = await db.encryptedSecret.findFirst({
      where: {
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        purpose: args.purpose as SecretPurpose,
        purgedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new SecretConflictError(
        "an active secret already exists for this owner/purpose (use rotateSecret to supersede)",
        { purpose: args.purpose, rail: args.rail, ownerType: args.ownerType },
      );
    }
    try {
      await db.encryptedSecret.create({
        data: {
          id: secretRef,
          purpose: args.purpose as SecretPurpose,
          rail: args.rail,
          ownerType: args.ownerType,
          ownerId: args.ownerId,
          ciphertext: toBytes(envelope),
          encVersion,
          kekVersion,
          expiresAt: args.expiresAt ?? null,
        },
      });
    } catch (err) {
      // Partial unique index is the race-proof backstop.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new SecretConflictError(
          "an active secret already exists for this owner/purpose (unique index)",
          { purpose: args.purpose, rail: args.rail, ownerType: args.ownerType },
        );
      }
      throw err;
    }
    return secretRef;
  };

  const ref = opts?.tx ? await run(opts.tx) : await prisma.$transaction(run);

  await logAuditEvent({
    userId: null,
    action: "secret.stored",
    entityType: ENTITY_TYPE,
    entityId: ref,
    metadata: {
      encRef: ref,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
      reason: args.reason ?? null,
    },
  });
  return ref;
}

// ── readSecret ──────────────────────────────────────────────────────────────

export type ReadSecretArgs = OwnerIdentity;

/** Decrypt and return a RevealableSecret. Enforces R4 + R6. */
export async function readSecret(args: ReadSecretArgs): Promise<RevealableSecret> {
  assertPurposeRailOwner(args); // R1/R2/R3 on the args themselves

  const row = await prisma.encryptedSecret.findUnique({
    where: { id: args.secretRef },
  });
  if (!row) {
    throw new SecretNotFoundError("no secret for the given handle", {
      encRef: args.secretRef,
      purpose: args.purpose,
    });
  }
  assertStoredRowMatches(row, args); // R4

  if (row.purgedAt !== null) {
    throw new SecretPurgedError("secret has been purged", { encRef: args.secretRef }); // R6
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    throw new SecretExpiredError("secret has expired", { encRef: args.secretRef }); // R6
  }
  if (!row.ciphertext) {
    throw new SecretNotFoundError("secret has no ciphertext (non-DB_ENVELOPE backend?)", {
      encRef: args.secretRef,
    });
  }

  let plaintext: string;
  try {
    plaintext = decryptSecret(Buffer.from(row.ciphertext), args);
  } catch (err) {
    if (err instanceof SecretDecryptionError) alertDecryption(err, args);
    throw err;
  }

  return new RevealableSecret({
    plaintext,
    secretRef: args.secretRef,
    purpose: args.purpose,
    rail: args.rail,
  });
}

// ── findActiveSecretRef (owner-tuple lookup for singleton owners) ─────────────

/**
 * Resolve the handle of the single active (non-purged) secret for an owner tuple —
 * for singleton owners that do NOT store the secretRef on an owner row (e.g. the
 * Platform Grow-SaaS merchant key). The partial unique index guarantees at most one
 * active row. Returns the secretRef, or null if none. (EncryptedSecret access is
 * intentionally confined to this Layer-1 module by the import-boundary lint, so
 * Layer-2 facades resolve singleton handles through here, not via prisma directly.)
 */
export async function findActiveSecretRef(args: {
  purpose: string;
  rail: string;
  ownerType: string;
  ownerId: string;
}): Promise<string | null> {
  assertPurposeRailOwner(args); // R1/R2/R3 on the tuple
  const row = await prisma.encryptedSecret.findFirst({
    where: {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      purpose: args.purpose as SecretPurpose,
      purgedAt: null,
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

// ── rotateSecret ────────────────────────────────────────────────────────────

export interface RotateSecretArgs extends OwnerIdentity {
  /** Omit ⇒ rewrap (KEK rotation, ref stable). Provide ⇒ value rotation (new ref). */
  newPlaintext?: string;
  reason: string;
}

/**
 * rewrap (no newPlaintext): re-wrap the DEK under the active KEK; ref stable.
 * value rotation (newPlaintext): purge the old row + insert a new one atomically;
 * returns the NEW ref (caller must update the owner's *SecretRef).
 *
 * Pass `opts.tx` to run every read+write on a caller transaction so the rotation
 * commits/rolls back atomically with the caller's other work (no nested $transaction).
 * The audit event is still emitted after the rotation, outside any caller txn —
 * matching storeSecret's behavior.
 */
export async function rotateSecret(
  args: RotateSecretArgs,
  opts?: { tx?: Prisma.TransactionClient },
): Promise<string> {
  assertPurposeRailOwner(args); // R1/R2/R3

  const db: SecretDb = opts?.tx ?? prisma;

  const row = await db.encryptedSecret.findUnique({
    where: { id: args.secretRef },
  });
  if (!row) {
    throw new SecretNotFoundError("no secret for the given handle", {
      encRef: args.secretRef,
      purpose: args.purpose,
    });
  }
  assertStoredRowMatches(row, args); // R4

  // ── value rotation ──
  if (typeof args.newPlaintext === "string") {
    if (args.newPlaintext.length === 0) {
      throw new SecretValidationError("newPlaintext must be a non-empty string", {
        encRef: args.secretRef,
      }); // R7
    }
    const newRef = generateSecretId();
    const aad: AadParams = {
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      secretRef: newRef,
    };
    const { envelope, encVersion, kekVersion } = encryptSecret(args.newPlaintext, aad);

    const run = async (tx: Prisma.TransactionClient): Promise<void> => {
      // Purge the old row first so the partial unique index admits the new one.
      await tx.encryptedSecret.update({
        where: { id: args.secretRef },
        data: { purgedAt: new Date(), ciphertext: null },
      });
      await tx.encryptedSecret.create({
        data: {
          id: newRef,
          purpose: args.purpose as SecretPurpose,
          rail: args.rail,
          ownerType: args.ownerType,
          ownerId: args.ownerId,
          ciphertext: toBytes(envelope),
          encVersion,
          kekVersion,
          expiresAt: row.expiresAt,
        },
      });
    };
    // Reuse the caller txn when provided (no nested $transaction); else open our own.
    if (opts?.tx) await run(opts.tx);
    else await prisma.$transaction(run);

    await logAuditEvent({
      userId: null,
      action: "secret.rotated",
      entityType: ENTITY_TYPE,
      entityId: newRef,
      metadata: {
        mode: "value",
        encRef: newRef,
        supersededEncRef: args.secretRef,
        purpose: args.purpose,
        rail: args.rail,
        ownerType: args.ownerType,
        reason: args.reason,
      },
    });
    return newRef;
  }

  // ── rewrap (KEK rotation) ──
  if (row.purgedAt !== null || !row.ciphertext) {
    // R6: rewrap is a no-op on a purged/empty row (nothing to re-wrap).
    return args.secretRef;
  }

  let rewrapped;
  try {
    rewrapped = rewrapSecret(Buffer.from(row.ciphertext), args);
  } catch (err) {
    if (err instanceof SecretDecryptionError) alertDecryption(err, args);
    throw err;
  }

  await db.encryptedSecret.update({
    where: { id: args.secretRef },
    data: {
      ciphertext: toBytes(rewrapped.envelope),
      kekVersion: rewrapped.kekVersion,
      rotatedAt: new Date(),
    },
  });

  await logAuditEvent({
    userId: null,
    action: "secret.rotated",
    entityType: ENTITY_TYPE,
    entityId: args.secretRef,
    metadata: {
      mode: "rewrap",
      encRef: args.secretRef,
      kekVersion: rewrapped.kekVersion,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
      reason: args.reason,
    },
  });
  return args.secretRef;
}

// ── purgeSecret ─────────────────────────────────────────────────────────────

export interface PurgeSecretArgs extends OwnerIdentity {
  reason: string;
}

/** Idempotent crypto-shred + tombstone. R4-checked. Touching a purged row is a no-op. */
export async function purgeSecret(args: PurgeSecretArgs): Promise<void> {
  assertPurposeRailOwner(args); // R1/R2/R3

  const row = await prisma.encryptedSecret.findUnique({
    where: { id: args.secretRef },
  });
  if (!row) {
    throw new SecretNotFoundError("no secret for the given handle", {
      encRef: args.secretRef,
      purpose: args.purpose,
    });
  }
  assertStoredRowMatches(row, args); // R4

  if (row.purgedAt !== null) return; // R6 idempotent

  await prisma.encryptedSecret.update({
    where: { id: args.secretRef },
    data: { purgedAt: new Date(), ciphertext: null },
  });

  await logAuditEvent({
    userId: null,
    action: "secret.purged",
    entityType: ENTITY_TYPE,
    entityId: args.secretRef,
    metadata: {
      encRef: args.secretRef,
      purpose: args.purpose,
      rail: args.rail,
      ownerType: args.ownerType,
      reason: args.reason,
    },
  });
}

// ── purgeSecretsForOwner (owner-delete cascade) ─────────────────────────────

/**
 * Crypto-shred every active secret for an owner row. MUST be called by every
 * owner-deletion path (user/subscription/session/payment deletion). The orphan
 * sweeper (lifecycle.ts) is the safety net for any missed call.
 * Returns the number of rows purged.
 */
export async function purgeSecretsForOwner(
  ownerType: string,
  ownerId: string,
  reason = "owner_deleted",
): Promise<number> {
  const { count } = await prisma.encryptedSecret.updateMany({
    where: { ownerType, ownerId, purgedAt: null },
    data: { purgedAt: new Date(), ciphertext: null },
  });

  if (count > 0) {
    await logAuditEvent({
      userId: null,
      action: "secret.purged_for_owner",
      entityType: ENTITY_TYPE,
      entityId: ownerId,
      metadata: { ownerType, ownerId, count, reason },
    });
  }
  return count;
}
