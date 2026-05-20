/**
 * src/lib/audit/log-audit-event.ts
 *
 * Central helper for writing append-only AuditLog rows.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   await logAuditEvent({
 *     userId:     broker.id,          // null for system/webhook/public actions
 *     action:     "contract.created",
 *     entityType: "contract",
 *     entityId:   contract.id,
 *     metadata:   { contractType, dealType, plan },
 *     ip:         request.headers.get("x-forwarded-for"),
 *     userAgent:  request.headers.get("user-agent"),
 *   });
 *
 * ── Safety ────────────────────────────────────────────────────────────────────
 * This function NEVER throws. Any error during the DB write is caught, logged to
 * console.error, and reported to Sentry. The caller's response is unaffected.
 *
 * ── Privacy ───────────────────────────────────────────────────────────────────
 * sanitizeMetadata() is applied to every `metadata` value before it reaches the
 * DB. It recursively:
 *   • Deletes keys on the BLOCKED_KEYS blocklist (secrets, tokens, full PII).
 *   • Truncates string values longer than MAX_STRING_LENGTH.
 *   • Replaces full phone strings with the last 4 digits only.
 *   • Replaces full idNumber strings with a boolean presence flag.
 *   • Strips email addresses unless explicitly passed via `emailLoggingAllowed`.
 *     (emailLoggingAllowed is a meta-key consumed by the helper, not written.)
 *
 * Callers MUST pass flat, pre-selected fields — not raw Prisma result objects.
 * Passing a full Prisma object risks leaking fields not on the blocklist.
 *
 * ── Action catalogue ──────────────────────────────────────────────────────────
 * See prisma/schema.prisma AuditLog model comment for the full list.
 */

import { prisma }            from "@/lib/prisma";
import { Prisma }            from "@/generated/prisma";
import * as Sentry           from "@sentry/nextjs";
import { sanitizeMetadata }  from "./sanitize-metadata";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEventInput {
  /** Broker or admin userId. Null for system, cron, webhook, and public-endpoint events. */
  userId?:             string | null;
  /** Action string from the catalogue, e.g. "contract.created". */
  action:              string;
  /** Entity type, e.g. "contract" | "payment" | "user" | "subscription" | "contractTemplate". */
  entityType:          string;
  /** The affected row's id. Null for collection-level actions. */
  entityId?:           string | null;
  /**
   * Structured context for the event. Sanitized before write.
   * Pass flat, pre-selected fields — never a full Prisma result object.
   * Set emailLoggingAllowed: true to retain email values in this metadata.
   */
  metadata?:           Record<string, unknown> | null;
  /** Request IP. Omit for cron / server-to-server events. */
  ip?:                 string | null;
  /** Browser User-Agent. Omit for server-to-server events. */
  userAgent?:          string | null;
}

// ── logAuditEvent ─────────────────────────────────────────────────────────────

/**
 * Write a single AuditLog row. Never throws — all errors are caught internally.
 *
 * Await this after the main operation succeeds. It is a fast single-row INSERT
 * and does not need to be deferred with after() unless the route is latency-critical.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const emailLoggingAllowed =
      typeof input.metadata?.emailLoggingAllowed === "boolean"
        ? input.metadata.emailLoggingAllowed
        : false;

    // Strip the meta-key from what gets persisted
    let rawMetadata = input.metadata ?? null;
    if (rawMetadata && "emailLoggingAllowed" in rawMetadata) {
      const { emailLoggingAllowed: _drop, ...rest } = rawMetadata;
      void _drop;
      rawMetadata = Object.keys(rest).length > 0 ? rest : null;
    }

    const sanitized =
      rawMetadata !== null
        ? sanitizeMetadata(rawMetadata, emailLoggingAllowed)
        : null;

    await prisma.auditLog.create({
      data: {
        userId:     input.userId     ?? null,
        action:     input.action,
        entityType: input.entityType,
        entityId:   input.entityId   ?? null,
        metadata:   (sanitized as Prisma.InputJsonValue | undefined) ?? undefined,
        ip:         input.ip         ?? null,
        userAgent:  input.userAgent  ?? null,
      },
    });
  } catch (err) {
    // Never propagate — audit failure must not break the calling route.
    console.error("[logAuditEvent] failed to write audit log:", err);
    Sentry.captureException(err, {
      tags:  { component: "audit_log" },
      extra: {
        action:     input.action,
        entityType: input.entityType,
        entityId:   input.entityId ?? null,
      },
    });
  }
}
