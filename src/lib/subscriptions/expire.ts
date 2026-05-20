/**
 * @/lib/subscriptions/expire — subscription expiry state machines.
 *
 * Implements two automated lifecycle transitions that the billing cron cannot
 * safely perform (it only handles active charge attempts):
 *
 *   expireTrialingSubscriptions()
 *     TRIALING → EXPIRED for users whose trial ended and have no chargeToken.
 *     If a chargeToken IS present the billing cron is responsible — this job
 *     does not touch those rows.
 *
 *   expirePastDueSubscriptions()
 *     PAST_DUE → EXPIRED for users who exhausted all retry attempts (indicated
 *     by nextBillingAt = null) and whose recovery window has elapsed.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *   Both processors use a WHERE status = <expected> guard inside the
 *   $transaction. If a concurrent process already moved the row, the update
 *   matches 0 rows and the iteration is skipped safely — no error, no duplicate
 *   SubscriptionEvent, no duplicate email.
 *
 * ── Email sends ───────────────────────────────────────────────────────────────
 *   Email delivery runs synchronously after the $transaction commits. Failures
 *   are caught and logged — they never roll back or block the DB transition.
 *   Every send attempt creates a Message row (PENDING → SENT/FAILED) for the
 *   admin message queue.
 *
 * ── Timing ────────────────────────────────────────────────────────────────────
 *   Called by /api/cron/subscriptions/expire at 08:00 UTC daily — 2 hours
 *   after the billing cron so any TRIALING subscription with a chargeToken has
 *   had at least one charge attempt before we declare it expired.
 *
 * ── Grace periods (env-overridable for testing) ───────────────────────────────
 *   TRIAL_EXPIRY_GRACE_HOURS  (default: 48) — hours after trialEndsAt before
 *     a no-token TRIALING subscription is expired. Ensures the billing cron has
 *     had at least two runs after the trial end date.
 *
 *   PAST_DUE_GRACE_DAYS (default: 14) — days after a subscription hits
 *     MAX_BILLING_FAILURES (nextBillingAt = null) before it is expired.
 *     Gives the user time to recover via /billing/success.
 */

import { prisma }                        from "@/lib/prisma";
import * as Sentry                        from "@sentry/nextjs";
import { logAuditEvent }                  from "@/lib/audit/log-audit-event";
import { sendEmail, trialExpiredEmail, subscriptionSuspendedEmail } from "@/lib/email";
import { PLAN_LABELS }                    from "@/lib/billing/amounts";
import type { BillablePlan }              from "@/lib/billing/amounts";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hours after trialEndsAt before a TRIALING+no-token sub is expired. */
const TRIAL_EXPIRY_GRACE_HOURS: number = (() => {
  const v = parseInt(process.env.TRIAL_EXPIRY_GRACE_HOURS ?? "", 10);
  return isNaN(v) || v < 1 ? 48 : v;
})();

/** Days after hitting MAX_BILLING_FAILURES (nextBillingAt=null) before EXPIRED. */
const PAST_DUE_GRACE_DAYS: number = (() => {
  const v = parseInt(process.env.PAST_DUE_GRACE_DAYS ?? "", 10);
  return isNaN(v) || v < 1 ? 14 : v;
})();

// ── Result types ──────────────────────────────────────────────────────────────

export type ExpiryOutcome =
  | "expired"           // successfully transitioned to EXPIRED
  | "skipped_race"      // another process already moved the row
  | "failed";           // unexpected error during processing

export interface ExpiryDetail {
  subscriptionId: string;
  userId:         string;
  outcome:        ExpiryOutcome;
  reason?:        string;
}

export interface ExpiryResult {
  ranAt:     string;   // ISO timestamp
  processed: number;
  expired:   number;
  skipped:   number;
  failed:    number;
  details:   ExpiryDetail[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPrismaP2002(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

/** Format a date as Hebrew locale string for email copy. */
function formatHeDate(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ── 1. TRIALING → EXPIRED ─────────────────────────────────────────────────────

/**
 * Expires TRIALING subscriptions where:
 *   • chargeToken IS NULL  (if present, billing cron handles it)
 *   • trialEndsAt < now - TRIAL_EXPIRY_GRACE_HOURS
 *
 * Per-subscription: $transaction → audit → email. Never throws.
 */
export async function expireTrialingSubscriptions(): Promise<ExpiryResult> {
  const now        = new Date();
  const graceCutoff = new Date(now.getTime() - TRIAL_EXPIRY_GRACE_HOURS * 60 * 60 * 1000);
  const details: ExpiryDetail[] = [];

  console.log(
    `[subscriptions/expire] TRIAL_EXPIRY_START` +
    ` at=${now.toISOString()}` +
    ` graceCutoff=${graceCutoff.toISOString()}` +
    ` (TRIAL_EXPIRY_GRACE_HOURS=${TRIAL_EXPIRY_GRACE_HOURS})`,
  );

  // Fetch eligible subscriptions. chargeToken intentionally NOT selected —
  // the WHERE clause already filters chargeToken IS NULL.
  const candidates = await prisma.subscription.findMany({
    where: {
      status:      "TRIALING",
      chargeToken: null,
      trialEndsAt: { lt: graceCutoff },
    },
    select: {
      id:          true,
      userId:      true,
      plan:        true,
      trialEndsAt: true,
    },
  });

  console.log(
    `[subscriptions/expire] TRIAL_EXPIRY_CANDIDATES count=${candidates.length}`,
  );

  for (const sub of candidates) {
    try {
      // ── $transaction: atomic status guard ────────────────────────────────
      // updateMany WHERE status=TRIALING returns count=0 if another process
      // already moved this row — safe concurrent no-op.
      const { count } = await prisma.$transaction(async (tx) => {
        const result = await tx.subscription.updateMany({
          where: { id: sub.id, status: "TRIALING" },
          data:  { status: "EXPIRED", canceledAt: now },
        });

        if (result.count > 0) {
          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: sub.id,
              event:          "trial_expired",
              fromStatus:     "TRIALING",
              toStatus:       "EXPIRED",
              fromPlan:       sub.plan,
              toPlan:         sub.plan,
              source:         "cron",
              actorId:        null,
              metadata:       JSON.stringify({
                reason:             "no_payment_method",
                trialEndsAt:        sub.trialEndsAt?.toISOString() ?? null,
                graceHours:         TRIAL_EXPIRY_GRACE_HOURS,
                expiredAt:          now.toISOString(),
              }),
            },
          });
        }

        return result;
      });

      if (count === 0) {
        // Another process won the race — already moved to non-TRIALING.
        console.log(
          `[subscriptions/expire] TRIAL_EXPIRY_RACE_SKIP subscriptionId=${sub.id}`,
        );
        details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "skipped_race" });
        continue;
      }

      console.log(
        `[subscriptions/expire] TRIAL_EXPIRED` +
        ` subscriptionId=${sub.id} userId=${sub.userId}` +
        ` trialEndsAt=${sub.trialEndsAt?.toISOString() ?? "(null)"}`,
      );

      // ── Audit log (outside transaction — consistent with existing patterns) ─
      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.expired",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          reason:      "trial_no_payment_method",
          fromStatus:  "TRIALING",
          toStatus:    "EXPIRED",
          trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
          graceHours:  TRIAL_EXPIRY_GRACE_HOURS,
        },
      });

      // ── Email (non-fatal) ─────────────────────────────────────────────────
      await sendTrialExpiredEmail(sub.userId, sub.trialEndsAt ?? now);

      details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "expired" });

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[subscriptions/expire] TRIAL_EXPIRY_ERROR` +
        ` subscriptionId=${sub.id} userId=${sub.userId}:`,
        err,
      );
      details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "failed", reason });
    }
  }

  return buildResult(now, details);
}

// ── 2. PAST_DUE → EXPIRED ────────────────────────────────────────────────────

/**
 * Expires PAST_DUE subscriptions where:
 *   • nextBillingAt IS NULL  (signals MAX_BILLING_FAILURES reached)
 *   • updatedAt < now - PAST_DUE_GRACE_DAYS
 *
 * Per-subscription: $transaction → audit → email. Never throws.
 */
export async function expirePastDueSubscriptions(): Promise<ExpiryResult> {
  const now        = new Date();
  const graceCutoff = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const details: ExpiryDetail[] = [];

  console.log(
    `[subscriptions/expire] PAST_DUE_EXPIRY_START` +
    ` at=${now.toISOString()}` +
    ` graceCutoff=${graceCutoff.toISOString()}` +
    ` (PAST_DUE_GRACE_DAYS=${PAST_DUE_GRACE_DAYS})`,
  );

  const candidates = await prisma.subscription.findMany({
    where: {
      status:        "PAST_DUE",
      nextBillingAt: null,          // null = MAX_BILLING_FAILURES reached
      updatedAt:     { lt: graceCutoff },
    },
    select: {
      id:              true,
      userId:          true,
      plan:            true,
      billingInterval: true,
      billingFailures: true,
      updatedAt:       true,
    },
  });

  console.log(
    `[subscriptions/expire] PAST_DUE_EXPIRY_CANDIDATES count=${candidates.length}`,
  );

  for (const sub of candidates) {
    try {
      // ── $transaction: atomic status guard ────────────────────────────────
      const { count } = await prisma.$transaction(async (tx) => {
        const result = await tx.subscription.updateMany({
          where: {
            id:            sub.id,
            status:        "PAST_DUE",
            nextBillingAt: null,   // double-guard: don't expire if recovery reset nextBillingAt
          },
          data: { status: "EXPIRED", canceledAt: now },
        });

        if (result.count > 0) {
          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: sub.id,
              event:          "subscription_expired",
              fromStatus:     "PAST_DUE",
              toStatus:       "EXPIRED",
              fromPlan:       sub.plan,
              toPlan:         sub.plan,
              source:         "cron",
              actorId:        null,
              metadata:       JSON.stringify({
                reason:         "past_due_grace_period_elapsed",
                billingFailures: sub.billingFailures,
                graceDays:      PAST_DUE_GRACE_DAYS,
                pastDueSince:   sub.updatedAt.toISOString(),
                expiredAt:      now.toISOString(),
              }),
            },
          });
        }

        return result;
      });

      if (count === 0) {
        // Another process won the race, or user completed recovery between
        // the scan and the update (nextBillingAt was set by recovery, so the
        // double-guard `nextBillingAt: null` clause matched 0 rows).
        console.log(
          `[subscriptions/expire] PAST_DUE_EXPIRY_RACE_SKIP subscriptionId=${sub.id}`,
        );
        details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "skipped_race" });
        continue;
      }

      console.log(
        `[subscriptions/expire] PAST_DUE_EXPIRED` +
        ` subscriptionId=${sub.id} userId=${sub.userId}` +
        ` billingFailures=${sub.billingFailures}` +
        ` pastDueSince=${sub.updatedAt.toISOString()}`,
      );

      // ── Audit log ─────────────────────────────────────────────────────────
      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.expired",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          reason:         "past_due_no_recovery",
          fromStatus:     "PAST_DUE",
          toStatus:       "EXPIRED",
          billingFailures: sub.billingFailures,
          graceDays:      PAST_DUE_GRACE_DAYS,
          pastDueSince:   sub.updatedAt.toISOString(),
        },
      });

      // ── Sentry: revenue-loss event — each expiry should be visible ─────────
      Sentry.captureMessage(
        `[subscriptions/expire] Subscription expired after PAST_DUE grace period`,
        {
          level: "error",
          tags:  {
            component: "subscription_expiry",
            reason:    "past_due_no_recovery",
          },
          extra: {
            subscriptionId:  sub.id,
            userId:          sub.userId,
            billingFailures: sub.billingFailures,
            graceDays:       PAST_DUE_GRACE_DAYS,
          },
        },
      );

      // ── Email (non-fatal) ─────────────────────────────────────────────────
      await sendSubscriptionSuspendedEmail(
        sub.userId,
        sub.plan,
        sub.billingInterval,
        now,
      );

      details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "expired" });

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[subscriptions/expire] PAST_DUE_EXPIRY_ERROR` +
        ` subscriptionId=${sub.id} userId=${sub.userId}:`,
        err,
      );
      details.push({ subscriptionId: sub.id, userId: sub.userId, outcome: "failed", reason });
    }
  }

  return buildResult(now, details);
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(ranAt: Date, details: ExpiryDetail[]): ExpiryResult {
  const expired = details.filter(d => d.outcome === "expired").length;
  const skipped = details.filter(d => d.outcome === "skipped_race").length;
  const failed  = details.filter(d => d.outcome === "failed").length;

  console.log(
    `[subscriptions/expire] RESULT` +
    ` processed=${details.length} expired=${expired} skipped=${skipped} failed=${failed}`,
  );

  return {
    ranAt:     ranAt.toISOString(),
    processed: details.length,
    expired,
    skipped,
    failed,
    details,
  };
}

// ── Email helpers (non-fatal — errors are swallowed, Message row is created) ──

async function sendTrialExpiredEmail(userId: string, trialEndsAt: Date): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, fullName: true },
    });
    const brokerEmail = user?.email?.trim() ?? "";
    if (!brokerEmail) {
      console.log(`[sendTrialExpiredEmail] userId=${userId} has no email — skipped`);
      return;
    }

    const baseUrl         = process.env.APP_BASE_URL?.trim() || "https://www.signdeal.co.il";
    const reactivateUrl   = `${baseUrl}/onboarding/billing`;
    const trialEndedAt    = formatHeDate(trialEndsAt);

    const template = trialExpiredEmail({
      brokerName:    user?.fullName ?? brokerEmail,
      trialEndedAt,
      reactivateUrl,
    });

    const message = await prisma.message.create({
      data: {
        type:           "TRIAL_EXPIRED",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        userId,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({
      to:        brokerEmail,
      ...template,
      emailType: "trial_expired",
    });

    await prisma.message.update({
      where: { id: message.id },
      data:  result.ok
        ? {
            status:            "SENT",
            providerMessageId: result.messageId ?? null,
            attempts:          1,
            lastAttemptAt:     new Date(),
          }
        : {
            status:        "FAILED",
            failureReason: result.reason,
            attempts:      1,
            lastAttemptAt: new Date(),
          },
    });

    if (!result.ok) {
      console.error(`[sendTrialExpiredEmail] userId=${userId} send failed: ${result.reason}`);
    } else {
      console.log(`[sendTrialExpiredEmail] sent userId=${userId} messageId=${result.messageId ?? "n/a"}`);
    }
  } catch (err) {
    // Must never propagate — DB state is already committed.
    console.error("[sendTrialExpiredEmail] unexpected error:", err);
  }
}

async function sendSubscriptionSuspendedEmail(
  userId:          string,
  plan:            string,
  billingInterval: string,
  suspendedAt:     Date,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, fullName: true },
    });
    const brokerEmail = user?.email?.trim() ?? "";
    if (!brokerEmail) {
      console.log(`[sendSubscriptionSuspendedEmail] userId=${userId} has no email — skipped`);
      return;
    }

    const baseUrl       = process.env.APP_BASE_URL?.trim() || "https://www.signdeal.co.il";
    const reactivateUrl = `${baseUrl}/onboarding/billing`;

    // Resolve human-readable labels (plan may be "STANDARD", "GROWTH", "PRO").
    const planLabel     = (PLAN_LABELS as Record<string, string>)[plan] ?? plan;
    const intervalLabel = billingInterval === "YEARLY" ? "שנתי" : "חודשי";

    const template = subscriptionSuspendedEmail({
      brokerName:      user?.fullName ?? brokerEmail,
      plan:            planLabel,
      billingInterval: intervalLabel,
      suspendedAt:     formatHeDate(suspendedAt),
      reactivateUrl,
    });

    const message = await prisma.message.create({
      data: {
        type:           "SUBSCRIPTION_SUSPENDED",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        userId,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({
      to:        brokerEmail,
      ...template,
      emailType: "subscription_suspended",
    });

    await prisma.message.update({
      where: { id: message.id },
      data:  result.ok
        ? {
            status:            "SENT",
            providerMessageId: result.messageId ?? null,
            attempts:          1,
            lastAttemptAt:     new Date(),
          }
        : {
            status:        "FAILED",
            failureReason: result.reason,
            attempts:      1,
            lastAttemptAt: new Date(),
          },
    });

    if (!result.ok) {
      console.error(
        `[sendSubscriptionSuspendedEmail] userId=${userId} send failed: ${result.reason}`,
      );
    } else {
      console.log(
        `[sendSubscriptionSuspendedEmail] sent userId=${userId} messageId=${result.messageId ?? "n/a"}`,
      );
    }
  } catch (err) {
    // Must never propagate — DB state is already committed.
    console.error("[sendSubscriptionSuspendedEmail] unexpected error:", err);
  }
}

// Re-export for use in tests / future admin tools.
export { TRIAL_EXPIRY_GRACE_HOURS, PAST_DUE_GRACE_DAYS };
