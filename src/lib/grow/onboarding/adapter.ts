/**
 * src/lib/grow/onboarding/adapter.ts
 *
 * Concrete GrowOnboardingPort. All Grow-specific behavior is here; routes stay
 * thin. Implements the retry-safe callback ingestion (rule 8):
 *
 *   • The event row + dedupKey are written BEFORE applying, but they DO NOT block
 *     a retry — only an outcome of "applied" short-circuits to 200.
 *   • A valid SUCCESS callback whose provisioning (seal api_key / upsert merchant
 *     / session update) fails returns 5xx and is NOT marked applied → Grow retries
 *     and we reprocess idempotently.
 *   • api_key is sealed via the Rail-B facade, never logged, never stored in
 *     sanitizedPayload.
 */

import { createHash, randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { GrowOnboardingStatus, Prisma } from "@/generated/prisma";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { sanitizeMetadata } from "@/lib/audit/sanitize-metadata";

import { isOnboardingEnabled } from "../config";
import { requestGetLink } from "./getlink";
import { parseOnboardingCallback } from "./callback-json";
import { buildDedupKey, findSessionForUpdate } from "./correlation";
import { isSuccessfulOnboarding } from "./state-machine";
import { provisionMerchantPending, recordFailedOnboarding } from "./provisioning";
import { verifyRouteToken, getConfiguredCallbackUrl } from "./callback-url";
import type {
  StartOnboardingInput,
  StartOnboardingResult,
  CallbackIngestResult,
} from "./types";
import type { GrowOnboardingPort, IngestCallbackArgs } from "./port";

const AUDIT_ENTITY = "growOnboardingSession";
const SANITIZED_PAYLOAD_MAX = 4000;
const SENTRY_TAGS = { component: "grow_onboarding_callback" } as const;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the stored sanitizedPayload: explicitly strip api_key (+ encrypted_lead)
 * THEN run the shared sanitizer (PII/secret heuristics) as defense-in-depth.
 * Never contains a plaintext secret.
 */
function buildSanitizedPayload(raw: Record<string, unknown>): string {
  let clone: Record<string, unknown>;
  try {
    clone = structuredClone(raw);
  } catch {
    clone = { ...raw };
  }
  const data = clone.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    delete d.api_key;
    delete d.encrypted_lead;
  }
  delete clone.api_key;
  delete clone.encrypted_lead;

  let serialized: string;
  try {
    serialized = JSON.stringify(sanitizeMetadata(clone, false));
  } catch {
    serialized = "[sanitize_error]";
  }
  return serialized.length > SANITIZED_PAYLOAD_MAX
    ? serialized.slice(0, SANITIZED_PAYLOAD_MAX) + "…"
    : serialized;
}

/** Create the event row; tolerate a concurrent create (P2002 on dedupKey). */
async function createOrFindEvent(data: {
  dedupKey: string;
  sanitizedPayload: string;
  contentType: string | null;
  contentTypeValid: boolean;
  parsedOk: boolean;
  sourceIp: string | null;
  httpMethod: string;
  outcome: string;
}): Promise<{ id: string }> {
  try {
    return await prisma.growOnboardingCallbackEvent.create({ data, select: { id: true } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const found = await prisma.growOnboardingCallbackEvent.findUnique({
        where: { dedupKey: data.dedupKey },
        select: { id: true },
      });
      if (found) return found;
    }
    throw err;
  }
}

async function setOutcome(
  eventId: string,
  outcome: string,
  sessionId?: string | null,
): Promise<void> {
  await prisma.growOnboardingCallbackEvent.update({
    where: { id: eventId },
    data: { outcome, ...(sessionId !== undefined ? { sessionId } : {}) },
  });
}

/** Best-effort outcome write that never throws (used on failure paths). */
async function setOutcomeSafe(eventId: string, outcome: string): Promise<void> {
  try {
    await setOutcome(eventId, outcome);
  } catch (err) {
    Sentry.captureException(err, { level: "error", tags: SENTRY_TAGS });
  }
}

function alert(message: string, level: Sentry.SeverityLevel, extra?: Record<string, unknown>): void {
  Sentry.captureMessage(message, { level, tags: SENTRY_TAGS, extra });
}

// ── adapter ──────────────────────────────────────────────────────────────────

export async function startOnboarding(
  input: StartOnboardingInput,
): Promise<StartOnboardingResult> {
  const link = await requestGetLink(input); // throws GrowApiError / GrowNetworkError

  const reference = randomBytes(32).toString("base64url"); // CSPRNG public handle
  const session = await prisma.growOnboardingSession.create({
    data: {
      reference,
      userId: input.userId,
      status: GrowOnboardingStatus.LINK_ISSUED,
      businessNumber: input.businessNumber,
      phone: input.phone,
      expectedTrackingCode: link.trackingCode, // null unless GetLink echoed it
    },
    select: { id: true },
  });
  // NOTE: link.encryptedLead is intentionally NOT persisted in Phase 2B (no
  // Rail-B Layer-2 sealing helper for GROW_ONBOARDING_LEAD). It is dropped here.

  await logAuditEvent({
    userId: input.userId,
    action: "grow.onboarding.started",
    entityType: AUDIT_ENTITY,
    entityId: session.id,
    metadata: { sentSms: !!input.sendSms, hasTrackingCode: !!link.trackingCode },
  });

  return { sessionId: session.id, reference, formUrl: link.formUrl };
}

export async function ingestCallback(
  args: IngestCallbackArgs,
): Promise<CallbackIngestResult> {
  // 1. Route-token gate. Bad token → generic 200, no DB row (avoid spam), alert.
  if (!verifyRouteToken(args.routeToken)) {
    alert("[grow-onboarding] callback with invalid route token", "warning", {
      sourceIp: args.sourceIp,
    });
    await logAuditEvent({
      userId: null,
      action: "grow.onboarding.callback_rejected",
      entityType: AUDIT_ENTITY,
      entityId: null,
      metadata: { reason: "bad_route_token" },
      ip: args.sourceIp,
    });
    return { httpStatus: 200, outcome: "rejected", applied: false, sessionId: null };
  }

  // 2. LOCKED parse (application/json only). Malformed → store safe marker, 200.
  const parsed = parseOnboardingCallback(args.rawText, args.contentType);
  if (!parsed.ok) {
    const dedupKey = createHash("sha256")
      .update(`parsefail|${args.contentType ?? ""}|${args.rawText}`)
      .digest("hex");
    const marker = `[unparseable reason=${parsed.reason} content-type=${
      args.contentType ?? "none"
    } len=${args.rawText.length}]`;
    const event = await createOrFindEvent({
      dedupKey,
      sanitizedPayload: marker,
      contentType: args.contentType,
      contentTypeValid: parsed.reason !== "unsupported_content_type",
      parsedOk: false,
      sourceIp: args.sourceIp,
      httpMethod: args.httpMethod,
      outcome: "rejected",
    });
    alert("[grow-onboarding] callback failed to parse", "error", { reason: parsed.reason });
    await logAuditEvent({
      userId: null,
      action: "grow.onboarding.callback_unparseable",
      entityType: "growOnboardingCallbackEvent",
      entityId: event.id,
      metadata: { reason: parsed.reason, contentType: args.contentType },
      ip: args.sourceIp,
    });
    return { httpStatus: 200, outcome: "rejected", applied: false, sessionId: null };
  }

  const { update, raw } = parsed;
  const dedupKey = buildDedupKey(update);
  const sanitizedPayload = buildSanitizedPayload(raw);

  // 3. Dedup: only an "applied" record short-circuits (rule 8). Others reprocess.
  const existing = await prisma.growOnboardingCallbackEvent.findUnique({
    where: { dedupKey },
    select: { id: true, outcome: true, sessionId: true },
  });
  if (existing && existing.outcome === "applied") {
    return { httpStatus: 200, outcome: "duplicate", applied: true, sessionId: existing.sessionId };
  }

  const event =
    existing ??
    (await createOrFindEvent({
      dedupKey,
      sanitizedPayload,
      contentType: args.contentType,
      contentTypeValid: true,
      parsedOk: true,
      sourceIp: args.sourceIp,
      httpMethod: args.httpMethod,
      outcome: "stored",
    }));

  // 4. Flags off → defer (no provisioning, no Grow side-effects). 503 = retryable.
  if (!isOnboardingEnabled()) {
    await setOutcomeSafe(event.id, "deferred");
    alert("[grow-onboarding] callback received while disabled", "warning");
    return { httpStatus: 503, outcome: "deferred", applied: false, sessionId: null };
  }

  // 5. Correlate (payload-only). No session → store + 200 + triage alert.
  const session = await findSessionForUpdate(update);
  if (!session) {
    await setOutcome(event.id, "uncorrelated", null);
    alert("[grow-onboarding] callback could not be correlated to a session", "error", {
      hasTrackingCode: !!update.trackingCode,
    });
    return { httpStatus: 200, outcome: "uncorrelated", applied: false, sessionId: null };
  }
  await setOutcome(event.id, "stored", session.id); // link event → session

  // 6a. Non-success callback (rejection / missing user_id) → record FAILED.
  if (!isSuccessfulOnboarding(update)) {
    try {
      await recordFailedOnboarding({ session, update });
    } catch (err) {
      Sentry.captureException(err, { level: "error", tags: SENTRY_TAGS });
      await setOutcomeSafe(event.id, "failed");
      return { httpStatus: 500, outcome: "failed", applied: false, sessionId: session.id };
    }
    await setOutcome(event.id, "applied", session.id);
    await logAuditEvent({
      userId: session.userId,
      action: "grow.onboarding.callback_rejected_by_grow",
      entityType: AUDIT_ENTITY,
      entityId: session.id,
      metadata: { trackingStatusId: update.trackingStatus?.id ?? null },
      ip: args.sourceIp,
    });
    return { httpStatus: 200, outcome: "applied", applied: true, sessionId: session.id };
  }

  // 6b. SUCCESS path — CRITICAL (rule 8). Provision, then mark applied LAST.
  try {
    await provisionMerchantPending({ session, update });
  } catch (err) {
    // No secrets in the alert. Do NOT mark applied → 5xx so Grow retries.
    Sentry.captureException(err, {
      level: "error",
      tags: SENTRY_TAGS,
      extra: { sessionId: session.id },
    });
    await setOutcomeSafe(event.id, "failed");
    return { httpStatus: 500, outcome: "failed", applied: false, sessionId: session.id };
  }

  // Mark applied ONLY after provisioning fully succeeded. If this write fails we
  // must 5xx (the dedup marker is unset) — the retry re-applies idempotently.
  try {
    await setOutcome(event.id, "applied", session.id);
  } catch (err) {
    Sentry.captureException(err, { level: "error", tags: SENTRY_TAGS, extra: { sessionId: session.id } });
    return { httpStatus: 500, outcome: "failed", applied: false, sessionId: session.id };
  }

  await logAuditEvent({
    userId: session.userId,
    action: "grow.onboarding.callback_applied",
    entityType: AUDIT_ENTITY,
    entityId: session.id,
    metadata: {
      hasGrowUserId: !!update.growUserId,
      hasApiKey: !!update.apiKey, // boolean only — never the value
      trackingStatusId: update.trackingStatus?.id ?? null,
    },
    ip: args.sourceIp,
  });

  return { httpStatus: 200, outcome: "applied", applied: true, sessionId: session.id };
}

export const growOnboardingAdapter: GrowOnboardingPort = {
  startOnboarding,
  ingestCallback,
  getCallbackUrl: getConfiguredCallbackUrl,
};
