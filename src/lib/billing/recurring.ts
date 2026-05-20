/**
 * @/lib/billing/recurring — recurring billing engine.
 *
 * Called by the Vercel cron at /api/cron/billing/charge (daily, 06:00 UTC).
 * Can also be triggered manually via curl for testing.
 *
 * ── Safety gates (both must be satisfied for a real charge to execute) ────────
 *
 *   Gate 1 — ENABLE_REAL_RECURRING_CHARGES=true
 *     Hard environment gate. Even with correct HYP credentials and a live
 *     subscription, no action=soft call is made unless this var is "true".
 *     When absent or any other value: logs REAL_CHARGES_DISABLED and skips.
 *     Remove this env var to disable charging with zero code changes.
 *
 *   Gate 2 — BILLING_CHARGE_DRY_RUN != "true"
 *     Soft dry-run mode. When "true": logs CHARGE_DRY_RUN per subscription
 *     and returns without writing any DB rows or calling HYP.
 *     Useful for verifying the scan finds the correct subscriptions.
 *
 * ── Recurring provider (controls what happens after both gates pass) ──────────
 *
 *   RECURRING_BILLING_PROVIDER=stub
 *     Full DB flow executes (BillingCharge PENDING→SUCCEEDED, Subscription
 *     TRIALING→ACTIVE, nextBillingAt advances, SubscriptionEvent written)
 *     but no HYP action=soft network call is made. Logs SOFT_CHARGE_STUB_SUCCESS.
 *     Use this for end-to-end DB testing before real money is involved.
 *
 *   RECURRING_BILLING_PROVIDER=hyp  (or unset — defaults to hyp)
 *     Real action=soft call sent to HYP. Only safe with production credentials.
 *
 * ── Eligibility criteria ─────────────────────────────────────────────────────
 *   billingProvider = "hyp"
 *   plan            IN (STANDARD, GROWTH, PRO)    ← AGENCY uses custom billing
 *   status          IN (TRIALING, ACTIVE, PAST_DUE)
 *   nextBillingAt   <= now()
 *   chargeToken     IS NOT NULL
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *   Primary:   successful charge advances nextBillingAt to the next period,
 *              so a second cron run on the same day finds nextBillingAt > now.
 *   Secondary: before creating a PENDING row, check for an existing
 *              PENDING/SUCCEEDED BillingCharge with the same periodStart.
 *              Guards against Vercel invoking the cron twice in one window.
 *
 * ── Crash safety ──────────────────────────────────────────────────────────────
 *   BillingCharge is pre-created as PENDING before the HYP call.
 *   If the process crashes between the HYP call and the DB update, the PENDING
 *   row is the audit anchor. The idempotency check skips that subscription on
 *   the next cron run (PENDING for same periodStart already exists).
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   chargeToken is fetched in a separate targeted query — never selected into
 *   the broad scan result where it could appear in logged objects.
 *   Raw HYP response bodies are never stored or logged (see callHypSoft).
 */

import { prisma }                                                       from "@/lib/prisma";
import { PLAN_AMOUNTS, PLAN_LABELS, BILLABLE_PLANS, type BillablePlan } from "./amounts";
import { callHypSoft, type SoftChargeResult }                           from "./providers/hyp";
import { logAuditEvent }                                                from "@/lib/audit/log-audit-event";
import { sendEmail, paymentFailedEmail }                               from "@/lib/email";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum consecutive charge failures before a subscription moves to PAST_DUE.
 * After MAX_BILLING_FAILURES the cron stops retrying — no further auto-charge.
 */
const MAX_BILLING_FAILURES = 3;

/**
 * Retry delay in days per failure count.
 * Index 0 = after 1st failure, index 1 = after 2nd failure.
 * A 3rd failure (index 2) hits MAX_BILLING_FAILURES → PAST_DUE, no retry.
 */
const RETRY_DELAY_DAYS: readonly number[] = [3, 5];

// ── Result shape ──────────────────────────────────────────────────────────────

export interface RecurringChargeResult {
  /** All subscriptions where nextBillingAt <= now (with or without chargeToken). */
  eligible:           number;
  /** Charge succeeded — HYP returned CCode=0. */
  charged:            number;
  /** Charge attempted — HYP returned non-zero CCode. */
  failed:             number;
  /** No charge attempted (idempotency skip, missing token/expiry, non-billable plan). */
  skipped:            number;
  /** Due but missing chargeToken — cannot charge; needs investigation. */
  noToken:            number;
  /** Subscriptions logged as CHARGE_DRY_RUN (only when BILLING_CHARGE_DRY_RUN=true). */
  dryRunLogged:       number;
  /** Whether BILLING_CHARGE_DRY_RUN=true was active for this run. */
  dryRunMode:         boolean;
  /** Whether ENABLE_REAL_RECURRING_CHARGES=true was active for this run. */
  realChargesEnabled: boolean;
  /** Which recurring provider was active: "stub" (no HYP call) or "hyp" (real charge). */
  recurringProvider:  "stub" | "hyp";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance a date by one billing period (month or year). */
function computePeriodEnd(from: Date, interval: string): Date {
  const d = new Date(from);
  if (interval === "YEARLY") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/** Retry date for failure N (1-indexed). Returns null when MAX_BILLING_FAILURES reached. */
function computeRetryDate(now: Date, newFailureCount: number): Date | null {
  if (newFailureCount >= MAX_BILLING_FAILURES) return null;
  const delayDays = RETRY_DELAY_DAYS[newFailureCount - 1] ?? RETRY_DELAY_DAYS.at(-1)!;
  return new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function processRecurringCharges(): Promise<RecurringChargeResult> {
  const now = new Date();

  // ── Read safety gates + provider selection ────────────────────────────────
  const realChargesEnabled = process.env.ENABLE_REAL_RECURRING_CHARGES === "true";
  const isDryRun           = process.env.BILLING_CHARGE_DRY_RUN === "true";

  // RECURRING_BILLING_PROVIDER selects between stub (full DB flow, no HYP call)
  // and hyp (real action=soft). Defaults to "hyp" when unset.
  // Only relevant after both safety gates pass — if either gate blocks, the
  // provider value is irrelevant and no charge executes regardless.
  const rawProvider       = process.env.RECURRING_BILLING_PROVIDER?.trim().toLowerCase();
  const recurringProvider = rawProvider === "stub" ? "stub" : "hyp";

  console.log(
    `[billing/recurring] SCAN_START` +
    ` at=${now.toISOString()}` +
    ` realChargesEnabled=${realChargesEnabled}` +
    ` isDryRun=${isDryRun}` +
    ` recurringProvider=${recurringProvider}`,
  );

  // ── Scan: due + chargeToken present ──────────────────────────────────────
  const dueWithToken = await prisma.subscription.findMany({
    where: {
      billingProvider: "hyp",
      plan:            { in: ["STANDARD", "GROWTH", "PRO"] },
      status:          { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      nextBillingAt:   { lte: now },
      chargeToken:     { not: null },
    },
    select: {
      id:              true,
      userId:          true,
      plan:            true,
      billingInterval: true,
      status:          true,
      nextBillingAt:   true,
      billingFailures: true,
      cardExpMonth:    true,
      cardExpYear:     true,
      firstPaymentAt:  true,
      // chargeToken intentionally NOT selected — fetched per-subscription below
    },
  });

  // ── Scan: due but no chargeToken ──────────────────────────────────────────
  const noTokenCount = await prisma.subscription.count({
    where: {
      billingProvider: "hyp",
      plan:            { in: ["STANDARD", "GROWTH", "PRO"] },
      status:          { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      nextBillingAt:   { lte: now },
      chargeToken:     null,
    },
  });

  const eligible = dueWithToken.length + noTokenCount;

  console.log(
    `[billing/recurring] SCAN_RESULT` +
    ` eligible=${eligible}` +
    ` withToken=${dueWithToken.length}` +
    ` noToken=${noTokenCount}`,
  );

  if (noTokenCount > 0) {
    console.warn(
      `[billing/recurring] NO_TOKEN_WARNING` +
      ` count=${noTokenCount}` +
      ` — subscriptions are due but missing chargeToken.` +
      ` Investigate Phase 3A getToken results for these users.`,
    );
  }

  // ── Per-subscription charge loop ──────────────────────────────────────────

  let charged     = 0;
  let failed      = 0;
  let skipped     = 0;
  let dryRunLogged = 0;

  for (const sub of dueWithToken) {
    const periodStart = sub.nextBillingAt!;
    const periodEnd   = computePeriodEnd(periodStart, sub.billingInterval);

    // ── Resolve amount ──────────────────────────────────────────────────────
    if (!BILLABLE_PLANS.has(sub.plan)) {
      console.warn(
        `[billing/recurring] SKIP_NON_BILLABLE_PLAN` +
        ` subscriptionId=${sub.id} plan=${sub.plan}`,
      );
      skipped++;
      continue;
    }
    const planKey       = sub.plan as BillablePlan;
    const amounts       = PLAN_AMOUNTS[planKey];
    const amountAgorot  = sub.billingInterval === "YEARLY" ? amounts.yearly : amounts.monthly;
    const amountShekels = amountAgorot / 100;

    // ── Gate 2: DRY_RUN ────────────────────────────────────────────────────
    if (isDryRun) {
      console.log(
        `[billing/recurring] CHARGE_DRY_RUN` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` plan=${sub.plan}` +
        ` interval=${sub.billingInterval}` +
        ` amountShekels=${amountShekels}` +
        ` status=${sub.status}` +
        ` nextBillingAt=${periodStart.toISOString()}` +
        ` billingFailures=${sub.billingFailures}` +
        ` cardExpMonth=${sub.cardExpMonth ?? "(none)"}` +
        ` cardExpYear=${sub.cardExpYear ?? "(none)"}`,
      );
      dryRunLogged++;
      continue;
    }

    // ── Gate 1: ENABLE_REAL_RECURRING_CHARGES ─────────────────────────────
    // This gate is checked AFTER DRY_RUN so dry-run still works when the
    // real-charge flag is off — useful for scan verification in staging.
    if (!realChargesEnabled) {
      console.log(
        `[billing/recurring] REAL_CHARGES_DISABLED` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` — set ENABLE_REAL_RECURRING_CHARGES=true to enable real charges`,
      );
      skipped++;
      continue;
    }

    // ── Idempotency check ──────────────────────────────────────────────────
    const existing = await prisma.billingCharge.findFirst({
      where: {
        subscriptionId: sub.id,
        periodStart,
        status: { in: ["PENDING", "SUCCEEDED"] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      console.log(
        `[billing/recurring] IDEMPOTENCY_SKIP` +
        ` subscriptionId=${sub.id}` +
        ` existingChargeId=${existing.id}` +
        ` existingStatus=${existing.status}` +
        ` periodStart=${periodStart.toISOString()}`,
      );
      skipped++;
      continue;
    }

    // ── Fetch chargeToken (targeted query — not logged) ────────────────────
    const tokenRow = await prisma.subscription.findUnique({
      where:  { id: sub.id },
      select: { chargeToken: true },
    });
    if (!tokenRow?.chargeToken) {
      console.warn(
        `[billing/recurring] SKIP_TOKEN_GONE` +
        ` subscriptionId=${sub.id}` +
        ` — chargeToken was present at scan but missing at charge time`,
      );
      skipped++;
      continue;
    }
    if (!sub.cardExpMonth || !sub.cardExpYear) {
      console.warn(
        `[billing/recurring] SKIP_MISSING_EXPIRY` +
        ` subscriptionId=${sub.id}` +
        ` cardExpMonth=${sub.cardExpMonth ?? "(null)"}` +
        ` cardExpYear=${sub.cardExpYear ?? "(null)"}`,
      );
      skipped++;
      continue;
    }

    // ── Pre-create PENDING BillingCharge ───────────────────────────────────
    // Created before the HYP call so a crash between the call and the DB
    // update still leaves an audit record.
    const charge = await prisma.billingCharge.create({
      data: {
        subscriptionId: sub.id,
        userId:         sub.userId,
        status:         "PENDING",
        amountAgorot,
        plan:           sub.plan,
        interval:       sub.billingInterval,
        periodStart,
        periodEnd,
        attemptNumber:  sub.billingFailures + 1,
      },
      select: { id: true },
    });

    const planLabel     = PLAN_LABELS[planKey];
    const intervalLabel = sub.billingInterval === "YEARLY" ? "שנתי" : "חודשי";

    console.log(
      `[billing/recurring] CHARGE_ATTEMPT` +
      ` chargeId=${charge.id}` +
      ` subscriptionId=${sub.id}` +
      ` userId=${sub.userId}` +
      ` plan=${sub.plan}` +
      ` interval=${sub.billingInterval}` +
      ` amountShekels=${amountShekels}` +
      ` attemptNumber=${sub.billingFailures + 1}` +
      ` periodStart=${periodStart.toISOString()}` +
      ` periodEnd=${periodEnd.toISOString()}`,
    );

    // ── Execute charge: stub or real HYP ──────────────────────────────────
    let result: SoftChargeResult;

    if (recurringProvider === "stub") {
      // Stub path — full DB flow, no HYP network call.
      // chargeToken is present (verified above) but intentionally not logged.
      const fakeTransId = `stub-${charge.id}`;
      console.log(
        `[billing/recurring] SOFT_CHARGE_STUB_SUCCESS` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` plan=${sub.plan}` +
        ` amountShekels=${amountShekels}` +
        ` fakeTransId=${fakeTransId}` +
        ` — no HYP action=soft call made`,
      );
      result = { ok: true, cCode: "0", hypTransId: fakeTransId, authCode: "STUB" };

    } else {
      // Real HYP path — action=soft sent to pay.hyp.co.il.
      // chargeToken passed directly; callHypSoft never logs its value.
      result = await callHypSoft({
        chargeToken:   tokenRow.chargeToken,    // never logged
        amountShekels,
        cardExpMonth:  sub.cardExpMonth,
        cardExpYear:   sub.cardExpYear,
        order:         charge.id,
        info:          `${planLabel} · ${intervalLabel}`,
      });
    }

    // ── Success path ───────────────────────────────────────────────────────
    if (result.ok) {
      await prisma.$transaction(async (tx) => {
        await tx.billingCharge.update({
          where: { id: charge.id },
          data: {
            status:      "SUCCEEDED",
            hypCCode:    result.cCode,
            hypTransId:  result.hypTransId,   // may be null — HYP sometimes omits TransId
            hypAuthCode: result.authCode,     // ACode from HYP; null if not returned
            // hypRaw intentionally not stored — may contain card-adjacent values
          },
        });

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status:             "ACTIVE",
            nextBillingAt:      periodEnd,
            currentPeriodStart: periodStart,
            currentPeriodEnd:   periodEnd,
            billingFailures:    0,
            // firstPaymentAt: set to now only on the very first charge
            firstPaymentAt:     sub.firstPaymentAt ?? now,
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            event:          "payment_succeeded",
            fromPlan:       sub.plan,
            toPlan:         sub.plan,
            fromStatus:     sub.status,
            toStatus:       "ACTIVE",
            source:         "cron",
            actorId:        null,
            metadata: JSON.stringify({
              chargeId:    charge.id,
              hypTransId:  result.hypTransId,
              amountAgorot,
              plan:        sub.plan,
              interval:    sub.billingInterval,
              periodStart: periodStart.toISOString(),
              periodEnd:   periodEnd.toISOString(),
            }),
          },
        });
      });

      // ── Audit: payment succeeded ───────────────────────────────────────────
      // fromStatus captured from sub (fetched before the transaction).
      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.payment.succeeded",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          plan:            sub.plan,
          billingInterval: sub.billingInterval,
          amountAgorot,
          chargeId:        charge.id,
          fromStatus:      sub.status,
        },
      });

      // ── Audit: activated (TRIALING → ACTIVE on first real charge) ─────────
      if (sub.status === "TRIALING") {
        await logAuditEvent({
          userId:     sub.userId,
          action:     "subscription.activated",
          entityType: "subscription",
          entityId:   sub.id,
          metadata:   {
            plan:            sub.plan,
            billingInterval: sub.billingInterval,
            fromStatus:      "TRIALING",
            toStatus:        "ACTIVE",
            source:          "recurring_billing",
          },
        });
      }

      console.log(
        `[billing/recurring] CHARGE_SUCCEEDED` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` cCode="${result.cCode}"` +
        ` hasTransId=${Boolean(result.hypTransId)}` +
        ` amountShekels=${amountShekels}` +
        ` nextBillingAt=${periodEnd.toISOString()}`,
      );
      charged++;

    // ── Failure path ───────────────────────────────────────────────────────
    } else {
      const newFailures    = sub.billingFailures + 1;
      const isMaxFailures  = newFailures >= MAX_BILLING_FAILURES;
      const retryDate      = computeRetryDate(now, newFailures);
      const newStatus      = isMaxFailures
        ? ("PAST_DUE" as const)
        : sub.status;

      await prisma.$transaction(async (tx) => {
        await tx.billingCharge.update({
          where: { id: charge.id },
          data: {
            status:      "FAILED",
            hypCCode:    result.cCode,
            hypTransId:  result.hypTransId,
            nextRetryAt: retryDate,
            // hypRaw intentionally not stored
          },
        });

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            billingFailures: newFailures,
            status:          newStatus,
            // Advance cursor to retry date, or null on PAST_DUE.
            // Setting nextBillingAt=null prevents the cron from picking up this
            // subscription again (NULL does not satisfy { lte: now } in Prisma).
            nextBillingAt:   retryDate ?? null,
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            event:          "payment_failed",
            fromPlan:       sub.plan,
            toPlan:         sub.plan,
            fromStatus:     sub.status,
            toStatus:       newStatus,
            source:         "cron",
            actorId:        null,
            metadata: JSON.stringify({
              chargeId:      charge.id,
              hypCCode:      result.cCode,
              attemptNumber: newFailures,
              isMaxFailures,
              retryDate:     retryDate?.toISOString() ?? null,
            }),
          },
        });
      });

      // ── Audit: payment failed ──────────────────────────────────────────────
      // fromStatus captured from sub (fetched before the transaction).
      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.payment.failed",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          plan:            sub.plan,
          billingInterval: sub.billingInterval,
          amountAgorot,
          chargeId:        charge.id,
          fromStatus:      sub.status,
          toStatus:        newStatus,
          attemptNumber:   newFailures,
          isMaxFailures,
        },
      });

      // ── Email broker: payment failed ───────────────────────────────────────
      // Runs synchronously (no after() — this is a cron context, not a route).
      // Errors are caught internally — must never break the billing loop.
      await sendSubscriptionPaymentFailedEmail({
        userId:          sub.userId,
        plan:            planLabel,
        billingInterval: intervalLabel,
        amountShekels,
        attemptNumber:   newFailures,
        isMaxFailures,
        retryDate,
      });

      console.warn(
        `[billing/recurring] CHARGE_FAILED` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` cCode="${result.cCode}"` +
        ` newFailures=${newFailures}` +
        ` newStatus=${newStatus}` +
        ` retryDate=${retryDate?.toISOString() ?? "(none — PAST_DUE)"}`,
      );
      failed++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(
    `[billing/recurring] SCAN_COMPLETE` +
    ` eligible=${eligible}` +
    ` charged=${charged}` +
    ` failed=${failed}` +
    ` skipped=${skipped}` +
    ` dryRunLogged=${dryRunLogged}` +
    ` noToken=${noTokenCount}` +
    ` realChargesEnabled=${realChargesEnabled}` +
    ` isDryRun=${isDryRun}` +
    ` recurringProvider=${recurringProvider}`,
  );

  return {
    eligible,
    charged,
    failed,
    skipped,
    noToken:            noTokenCount,
    dryRunLogged,
    dryRunMode:         isDryRun,
    realChargesEnabled,
    recurringProvider,
  };
}

// ── Helper: email broker on subscription payment failure (never throws) ────────
// Called synchronously in the cron billing loop — after() is not available
// outside Next.js route handlers. Errors are swallowed so a send failure
// never interrupts the charge loop or affects the DB state.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendSubscriptionPaymentFailedEmail(params: {
  userId:          string;
  plan:            string;
  billingInterval: string;
  amountShekels:   number;
  attemptNumber:   number;
  isMaxFailures:   boolean;
  retryDate:       Date | null;
}): Promise<void> {
  try {
    const { userId, plan, billingInterval, amountShekels, attemptNumber, isMaxFailures, retryDate } = params;

    // Fetch broker name + email — not included in the subscription select to
    // avoid loading PII for every subscription in the scan.
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, fullName: true },
    });

    const brokerEmail = user?.email?.trim() ?? "";
    if (!brokerEmail) {
      console.log(
        `[sendSubscriptionPaymentFailedEmail] userId=${userId} has no email — skipped`,
      );
      return;
    }

    const baseUrl          = process.env.APP_BASE_URL?.trim() || "https://www.signdeal.co.il";
    const updatePaymentUrl = `${baseUrl}/settings/billing/payment-method`;

    const retryDateFormatted = retryDate
      ? retryDate.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })
      : null;

    const template = paymentFailedEmail({
      brokerName:       user?.fullName ?? brokerEmail,
      plan,
      billingInterval,
      amountNis:        amountShekels,   // amountShekels = agorot / 100 = whole NIS
      attemptNumber,
      isMaxFailures,
      retryDate:        retryDateFormatted,
      updatePaymentUrl,
    });

    // Create PENDING record before the network call so a mid-flight crash
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type:           "SUBSCRIPTION_PAYMENT_FAILED",
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
      emailType: "subscription_payment_failed",
    });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
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
        `[sendSubscriptionPaymentFailedEmail] email failed for userId=${userId}: ${result.reason}`,
      );
    } else {
      console.log(
        `[sendSubscriptionPaymentFailedEmail] sent — userId=${userId}` +
        ` messageId=${result.messageId ?? "n/a"}`,
      );
    }
  } catch (err) {
    // Must never propagate — billing DB state is already committed.
    console.error("[sendSubscriptionPaymentFailedEmail] unexpected error:", err);
  }
}
