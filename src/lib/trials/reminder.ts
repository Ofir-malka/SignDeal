/**
 * @/lib/trials/reminder — trial-ending email reminder logic.
 *
 * Designed to be called from any context:
 *   - POST /api/admin/trials/process   (current: manual admin trigger)
 *   - Vercel Cron job                  (future: add to vercel.json)
 *   - Any background queue worker      (future)
 *
 * ── Reminder windows ──────────────────────────────────────────────────────────
 *   "3-day" stage: trialEndsAt ∈ [now + 2 days, now + 4 days)
 *   "1-day" stage: trialEndsAt ∈ [now + 0 days, now + 2 days)
 *
 *   Windows are deliberately non-overlapping at the 2-day boundary so a user
 *   at exactly 2 days receives the 3-day reminder, never both in the same run.
 *
 * ── Duplicate prevention ──────────────────────────────────────────────────────
 *   After a successful send a SubscriptionEvent row is written with
 *   event = "trial_reminder_3d" or "trial_reminder_1d".
 *   Subsequent runs check for this row before sending — making every stage
 *   idempotent regardless of how often the function is called.
 *
 * ── Future cron integration ───────────────────────────────────────────────────
 *   1. Add to vercel.json:
 *      { "crons": [{ "path": "/api/admin/trials/process", "schedule": "0 8 * * *" }] }
 *   2. Replace requireAdmin() in the route with a Vercel cron-signature verifier.
 *   3. processTrialReminders() needs no changes — it is already cron-safe.
 */

import { prisma }                    from "@/lib/prisma";
import { sendEmail, trialEndingEmail } from "@/lib/email";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

interface ReminderStage {
  /** Human-readable label for logging */
  label:         string;
  /** Written to SubscriptionEvent.event — the idempotency key */
  eventKey:      string;
  /** trialEndsAt >= now + windowGteDays * DAY_MS */
  windowGteDays: number;
  /** trialEndsAt <  now + windowLtDays  * DAY_MS */
  windowLtDays:  number;
}

// Processed in order: 3d first so a user at exactly the 2-day boundary gets
// the "3-day" event, not the "1-day" event, in the same processing run.
const REMINDER_STAGES: readonly ReminderStage[] = [
  {
    label:         "3-day reminder",
    eventKey:      "trial_reminder_3d",
    windowGteDays: 2,
    windowLtDays:  4,
  },
  {
    label:         "1-day reminder",
    eventKey:      "trial_reminder_1d",
    windowGteDays: 0,
    windowLtDays:  2,
  },
] as const;

// ── Result types ──────────────────────────────────────────────────────────────

export type ReminderOutcome =
  | "sent"
  | "skipped_duplicate"
  | "skipped_no_email"
  | "skipped_no_trial_date"
  | "failed";

export interface ReminderDetail {
  subscriptionId: string;
  userId:         string;
  email:          string;
  stage:          string;
  daysLeft:       number;
  outcome:        ReminderOutcome;
  reason?:        string;
}

export interface ReminderResult {
  /** ISO timestamp of when this run started */
  ranAt:     string;
  processed: number;
  sent:      number;
  skipped:   number;
  failed:    number;
  details:   ReminderDetail[];
}

// ── Core function ─────────────────────────────────────────────────────────────

export async function processTrialReminders(): Promise<ReminderResult> {
  const now     = new Date();
  const details: ReminderDetail[] = [];

  for (const stage of REMINDER_STAGES) {
    const windowGte = new Date(now.getTime() + stage.windowGteDays * DAY_MS);
    const windowLt  = new Date(now.getTime() + stage.windowLtDays  * DAY_MS);

    // Fetch TRIALING subscriptions whose trial ends in this window.
    // Both @@index([status]) and @@index([trialEndsAt]) are used by the planner.
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status:      "TRIALING",
        trialEndsAt: { gte: windowGte, lt: windowLt },
      },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });

    console.log(
      `[trial-reminder] ${stage.label}: window [now+${stage.windowGteDays}d, now+${stage.windowLtDays}d)` +
      ` → ${subscriptions.length} candidate(s)`,
    );

    for (const sub of subscriptions) {
      const { user } = sub;

      // ── Guard: trialEndsAt should always be set for TRIALING rows ──────────
      if (!sub.trialEndsAt) {
        details.push({
          subscriptionId: sub.id, userId: user.id, email: user.email,
          stage: stage.eventKey, daysLeft: 0,
          outcome: "skipped_no_trial_date",
          reason:  "trialEndsAt is null on a TRIALING subscription",
        });
        console.warn(
          `[trial-reminder] skipped subscription ${sub.id} (${stage.eventKey})` +
          ` — trialEndsAt is null`,
        );
        continue;
      }

      // Actual days left — ceiling so we never show 0 on the last day
      const msLeft   = sub.trialEndsAt.getTime() - now.getTime();
      const daysLeft = Math.max(1, Math.ceil(msLeft / DAY_MS));

      // ── Duplicate check ───────────────────────────────────────────────────
      // A SubscriptionEvent row for this stage means the email was already sent.
      const alreadySent = await prisma.subscriptionEvent.findFirst({
        where:  { subscriptionId: sub.id, event: stage.eventKey },
        select: { id: true },
      });

      if (alreadySent) {
        details.push({
          subscriptionId: sub.id, userId: user.id, email: user.email,
          stage: stage.eventKey, daysLeft,
          outcome: "skipped_duplicate",
          reason:  `SubscriptionEvent "${stage.eventKey}" already exists`,
        });
        console.log(
          `[trial-reminder] skipped ${user.email} (${stage.eventKey}) — already sent`,
        );
        continue;
      }

      // ── Email guard ───────────────────────────────────────────────────────
      // Email is a required non-empty String on User — this is purely defensive.
      if (!user.email.trim()) {
        details.push({
          subscriptionId: sub.id, userId: user.id, email: user.email,
          stage: stage.eventKey, daysLeft,
          outcome: "skipped_no_email",
          reason:  "user.email is empty",
        });
        console.warn(
          `[trial-reminder] skipped user ${user.id} (${stage.eventKey}) — no email`,
        );
        continue;
      }

      // ── Build + send ──────────────────────────────────────────────────────
      const trialEndsAtFormatted = sub.trialEndsAt.toLocaleDateString("he-IL", {
        day: "numeric", month: "long", year: "numeric",
      });

      const template = trialEndingEmail({
        fullName:    user.fullName,
        trialEndsAt: trialEndsAtFormatted,
        daysLeft,
      });

      // TODO(queue): Replace inline sendEmail with a durable job queue
      //   (BullMQ / Inngest) once retry-on-failure is required. The
      //   SubscriptionEvent idempotency key already handles duplicate prevention
      //   across retries — no additional dedup logic needed at the queue layer.
      try {
        const result = await sendEmail({ to: user.email, ...template });

        if (result.ok) {
          // Write the idempotency record AFTER a confirmed send.
          // If this write fails (very unlikely), the next run will re-send —
          // acceptable: one duplicate email is better than a silent drop.
          await prisma.subscriptionEvent.create({
            data: {
              subscriptionId: sub.id,
              event:          stage.eventKey,
              source:         "system",
              metadata:       JSON.stringify({
                daysLeft,
                trialEndsAt: sub.trialEndsAt.toISOString(),
                emailId:     result.messageId ?? null,
              }),
            },
          });

          details.push({
            subscriptionId: sub.id, userId: user.id, email: user.email,
            stage: stage.eventKey, daysLeft,
            outcome: "sent",
          });
          console.log(
            `[trial-reminder] ✓ sent ${stage.eventKey} to ${user.email}` +
            ` — daysLeft=${daysLeft} messageId=${result.messageId ?? "n/a"}`,
          );
        } else {
          // Provider returned an error (Resend API failure, bad key, etc.)
          // Do NOT write the SubscriptionEvent — allow retry on next run.
          details.push({
            subscriptionId: sub.id, userId: user.id, email: user.email,
            stage: stage.eventKey, daysLeft,
            outcome: "failed",
            reason:  result.reason,
          });
          console.error(
            `[trial-reminder] ✗ failed ${stage.eventKey} for ${user.email}:`,
            result.reason,
          );
        }
      } catch (err) {
        // Unexpected error (network, Prisma, etc.) — do not write event, allow retry.
        details.push({
          subscriptionId: sub.id, userId: user.id, email: user.email,
          stage: stage.eventKey, daysLeft,
          outcome: "failed",
          reason:  err instanceof Error ? err.message : String(err),
        });
        console.error(
          `[trial-reminder] ✗ unexpected error for ${user.email} (${stage.eventKey}):`,
          err,
        );
      }
    }
  }

  const sent    = details.filter(d => d.outcome === "sent").length;
  const skipped = details.filter(d => d.outcome.startsWith("skipped_")).length;
  const failed  = details.filter(d => d.outcome === "failed").length;

  console.log(
    `[trial-reminder] run complete — processed=${details.length}` +
    ` sent=${sent} skipped=${skipped} failed=${failed}`,
  );

  return {
    ranAt:     now.toISOString(),
    processed: details.length,
    sent,
    skipped,
    failed,
    details,
  };
}
