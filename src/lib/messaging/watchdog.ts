/**
 * @/lib/messaging/watchdog — Message delivery health monitor.
 *
 * READ-ONLY monitoring. No DB mutations. No email/SMS sends.
 *
 * Detects two classes of delivery problems and fires Sentry alerts so the
 * on-call engineer can investigate:
 *
 *   "stuck PENDING"   — Message rows that have been in PENDING status longer
 *                       than MESSAGE_WATCHDOG_PENDING_MINUTES (default: 60 min).
 *                       PENDING means the send was initiated (Message row created)
 *                       but the status was never updated to SENT or FAILED.
 *                       Cause: the send process crashed or timed out after
 *                       creating the row but before calling the provider.
 *
 *   "failed"          — Message rows with status = FAILED, split into:
 *                       • "eligible"  — attempts < MESSAGE_WATCHDOG_MAX_RETRIES
 *                                       Sentry warning — will be retried by Phase 2
 *                                       retry logic (not yet implemented).
 *                       • "exhausted" — attempts ≥ MESSAGE_WATCHDOG_MAX_RETRIES
 *                                       Sentry error — requires manual intervention.
 *
 * ── No-PII rule ───────────────────────────────────────────────────────────────
 *   Sentry events and console logs NEVER include:
 *     recipientEmail, recipientPhone, body, subject, failureReason,
 *     providerResponse, providerMessageId, clientId, contractId, paymentId.
 *   Safe to include: messageId, type (enum), channel (enum), userId,
 *     ageMinutes, attempts, nextRetryAt (timestamp only).
 *
 * ── Why no auto-retry here ─────────────────────────────────────────────────────
 *   Retrying a PENDING message without knowing whether the original send
 *   completed risks duplicate delivery. Phase 2 will add an idempotent retry
 *   mechanism with provider-side dedup. Until then, Phase 1 monitoring alerts
 *   the team so a human can investigate and manually re-trigger if safe.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   MESSAGE_WATCHDOG_PENDING_MINUTES   — minutes before PENDING is "stuck"
 *                                        (default: 60)
 *   MESSAGE_WATCHDOG_MAX_RETRIES       — attempts threshold for "exhausted"
 *                                        (default: 3)
 */

import { prisma }   from "@/lib/prisma";
import * as Sentry  from "@sentry/nextjs";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minutes after creation before a PENDING message is considered stuck. */
const PENDING_STUCK_MINUTES: number = (() => {
  const v = parseInt(process.env.MESSAGE_WATCHDOG_PENDING_MINUTES ?? "", 10);
  return isNaN(v) || v < 1 ? 60 : v;
})();

/**
 * Attempts threshold for "exhausted" classification.
 * A FAILED message with attempts ≥ this value requires manual intervention.
 */
const MAX_RETRIES: number = (() => {
  const v = parseInt(process.env.MESSAGE_WATCHDOG_MAX_RETRIES ?? "", 10);
  return isNaN(v) || v < 1 ? 3 : v;
})();

// ── Result types ──────────────────────────────────────────────────────────────

export type MessageIssueLevel = "warning" | "error";

/** A single message with a delivery issue. Contains NO PII. */
export interface MessageIssue {
  messageId:   string;
  type:        string;   // MessageType enum value (e.g. "SUBSCRIPTION_PAYMENT_FAILED")
  channel:     string;   // MessageChannel enum value (e.g. "EMAIL")
  userId:      string | null;
  ageMinutes:  number;
  attempts:    number;
  /** "pending_stuck" | "failed_eligible" | "failed_exhausted" */
  issueClass:  "pending_stuck" | "failed_eligible" | "failed_exhausted";
  level:       MessageIssueLevel;
}

export interface MessageWatchdogResult {
  ranAt:                string;   // ISO timestamp
  /** PENDING messages older than PENDING_STUCK_MINUTES. */
  pendingStuckCount:    number;
  /** FAILED messages with attempts < MAX_RETRIES. */
  failedEligibleCount:  number;
  /** FAILED messages with attempts ≥ MAX_RETRIES — need manual intervention. */
  failedExhaustedCount: number;
  /** Total issues found. */
  totalIssues:          number;
  /** Full issue list (no PII). */
  issues:               MessageIssue[];
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runMessageWatchdog(): Promise<MessageWatchdogResult> {
  const now          = new Date();
  const pendingCutoff = new Date(now.getTime() - PENDING_STUCK_MINUTES * 60 * 1000);

  console.log(
    `[messaging/watchdog] WATCHDOG_START` +
    ` at=${now.toISOString()}` +
    ` pendingCutoff=${pendingCutoff.toISOString()}` +
    ` pendingStuckMinutes=${PENDING_STUCK_MINUTES}` +
    ` maxRetries=${MAX_RETRIES}`,
  );

  // ── Query 1: stuck PENDING ─────────────────────────────────────────────────
  // Select only non-PII fields.
  const pendingRows = await prisma.message.findMany({
    where: {
      status:    "PENDING",
      createdAt: { lt: pendingCutoff },
    },
    select: {
      id:        true,
      type:      true,
      channel:   true,
      userId:    true,
      attempts:  true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },   // oldest first
  });

  // ── Query 2: all FAILED ────────────────────────────────────────────────────
  // Split into eligible vs exhausted in memory to avoid two round-trips.
  const failedRows = await prisma.message.findMany({
    where: { status: "FAILED" },
    select: {
      id:          true,
      type:        true,
      channel:     true,
      userId:      true,
      attempts:    true,
      createdAt:   true,
      nextRetryAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `[messaging/watchdog] WATCHDOG_SCAN` +
    ` pendingStuck=${pendingRows.length}` +
    ` failedTotal=${failedRows.length}`,
  );

  const issues: MessageIssue[] = [];
  let pendingStuckCount    = 0;
  let failedEligibleCount  = 0;
  let failedExhaustedCount = 0;

  // ── Process stuck PENDING ──────────────────────────────────────────────────
  for (const row of pendingRows) {
    const ageMs      = now.getTime() - row.createdAt.getTime();
    const ageMinutes = Math.floor(ageMs / 60_000);

    pendingStuckCount++;

    const issue: MessageIssue = {
      messageId:  row.id,
      type:       row.type,
      channel:    row.channel,
      userId:     row.userId,
      ageMinutes,
      attempts:   row.attempts,
      issueClass: "pending_stuck",
      level:      "warning",
    };
    issues.push(issue);

    // Per-message Sentry event — no PII fields.
    Sentry.captureMessage(
      `[message-watchdog] PENDING message stuck for ${ageMinutes} minutes`,
      {
        level: "warning",
        tags:  {
          component:  "message_watchdog",
          issueClass: "pending_stuck",
          messageType: row.type,
          channel:     row.channel,
        },
        extra: {
          messageId:  row.id,
          type:       row.type,
          channel:    row.channel,
          userId:     row.userId,
          ageMinutes,
          attempts:   row.attempts,
          resolution: "Investigate send process crash or timeout. Check provider dashboard for delivery status before retrying.",
        },
      },
    );

    console.warn(
      `[messaging/watchdog] PENDING_STUCK` +
      ` messageId=${row.id}` +
      ` type=${row.type}` +
      ` channel=${row.channel}` +
      ` userId=${row.userId ?? "null"}` +
      ` ageMinutes=${ageMinutes}` +
      ` attempts=${row.attempts}`,
    );
  }

  // ── Process FAILED ─────────────────────────────────────────────────────────
  const exhaustedRows: typeof failedRows = [];
  const eligibleRows:  typeof failedRows = [];

  for (const row of failedRows) {
    if (row.attempts >= MAX_RETRIES) {
      exhaustedRows.push(row);
    } else {
      eligibleRows.push(row);
    }
  }

  failedExhaustedCount = exhaustedRows.length;
  failedEligibleCount  = eligibleRows.length;

  // Exhausted: per-message Sentry "error" — these require manual review.
  for (const row of exhaustedRows) {
    const ageMs      = now.getTime() - row.createdAt.getTime();
    const ageMinutes = Math.floor(ageMs / 60_000);

    issues.push({
      messageId:  row.id,
      type:       row.type,
      channel:    row.channel,
      userId:     row.userId,
      ageMinutes,
      attempts:   row.attempts,
      issueClass: "failed_exhausted",
      level:      "error",
    });

    Sentry.captureMessage(
      `[message-watchdog] FAILED message exhausted after ${row.attempts} attempts — manual intervention required`,
      {
        level: "error",
        tags:  {
          component:   "message_watchdog",
          issueClass:  "failed_exhausted",
          messageType: row.type,
          channel:     row.channel,
        },
        extra: {
          messageId:  row.id,
          type:       row.type,
          channel:    row.channel,
          userId:     row.userId,
          ageMinutes,
          attempts:   row.attempts,
          resolution: "Max retry attempts reached. Inspect Message row and provider dashboard. Manual re-send required.",
        },
      },
    );

    console.error(
      `[messaging/watchdog] FAILED_EXHAUSTED` +
      ` messageId=${row.id}` +
      ` type=${row.type}` +
      ` channel=${row.channel}` +
      ` userId=${row.userId ?? "null"}` +
      ` ageMinutes=${ageMinutes}` +
      ` attempts=${row.attempts}`,
    );
  }

  // Eligible: one summary Sentry "warning" with type/channel breakdown (no individual IDs).
  if (eligibleRows.length > 0) {
    // Build a type breakdown — count by type string (enum value).
    // This gives the on-call engineer signal about which notification category
    // is failing without logging any PII.
    const typeBreakdown: Record<string, number> = {};
    const channelBreakdown: Record<string, number> = {};
    for (const row of eligibleRows) {
      typeBreakdown[row.type]       = (typeBreakdown[row.type]       ?? 0) + 1;
      channelBreakdown[row.channel] = (channelBreakdown[row.channel] ?? 0) + 1;
    }

    for (const row of eligibleRows) {
      const ageMs      = now.getTime() - row.createdAt.getTime();
      const ageMinutes = Math.floor(ageMs / 60_000);

      issues.push({
        messageId:  row.id,
        type:       row.type,
        channel:    row.channel,
        userId:     row.userId,
        ageMinutes,
        attempts:   row.attempts,
        issueClass: "failed_eligible",
        level:      "warning",
      });

      console.warn(
        `[messaging/watchdog] FAILED_ELIGIBLE` +
        ` messageId=${row.id}` +
        ` type=${row.type}` +
        ` channel=${row.channel}` +
        ` userId=${row.userId ?? "null"}` +
        ` ageMinutes=${ageMinutes}` +
        ` attempts=${row.attempts}`,
      );
    }

    Sentry.captureMessage(
      `[message-watchdog] ${eligibleRows.length} FAILED message(s) eligible for retry`,
      {
        level: "warning",
        tags:  {
          component:  "message_watchdog",
          issueClass: "failed_eligible",
        },
        extra: {
          failedEligibleCount: eligibleRows.length,
          maxRetries:          MAX_RETRIES,
          typeBreakdown,
          channelBreakdown,
          resolution: "Phase 2 retry job will re-attempt these. If Phase 2 is not yet deployed, manually re-trigger sends.",
        },
      },
    );
  }

  // Summary Sentry "error" when multiple exhausted messages exist.
  if (exhaustedRows.length > 1) {
    Sentry.captureMessage(
      `[message-watchdog] ${exhaustedRows.length} FAILED messages exhausted all retries — immediate investigation required`,
      {
        level: "error",
        tags:  { component: "message_watchdog" },
        extra: {
          failedExhaustedCount: exhaustedRows.length,
          failedEligibleCount:  eligibleRows.length,
          pendingStuckCount,
        },
      },
    );
  }

  const totalIssues = pendingStuckCount + failedEligibleCount + failedExhaustedCount;

  console.log(
    `[messaging/watchdog] WATCHDOG_COMPLETE` +
    ` pendingStuck=${pendingStuckCount}` +
    ` failedEligible=${failedEligibleCount}` +
    ` failedExhausted=${failedExhaustedCount}` +
    ` totalIssues=${totalIssues}`,
  );

  return {
    ranAt:                now.toISOString(),
    pendingStuckCount,
    failedEligibleCount,
    failedExhaustedCount,
    totalIssues,
    issues,
  };
}

// Re-export thresholds for use in tests.
export { PENDING_STUCK_MINUTES, MAX_RETRIES };
