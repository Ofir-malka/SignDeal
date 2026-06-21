/**
 * @/lib/billing/recurring — recurring billing engine.
 *
 * Called by the Vercel cron at /api/cron/billing/charge (daily, 06:00 UTC).
 * Can also be triggered manually via curl for testing.
 *
 * Provider-neutral: the per-provider charge call is delegated to the charger seam
 * (getRecurringCharger → HYP | Grow | stub). This engine NEVER calls callHypSoft or the Grow
 * .http.ts directly. HYP is TEMPORARY rollback code during the Grow transition; the final state
 * is Grow-only (the "hyp" branches are tagged TEMPORARY(hyp-removal)).
 *
 * ── Safety gates (both must be satisfied for a real charge to execute) ────────
 *
 *   Gate 1 — ENABLE_REAL_RECURRING_CHARGES=true
 *     Hard environment gate. No real charge executes unless this var is "true"
 *     (applies to BOTH providers). When absent: logs REAL_CHARGES_DISABLED and skips.
 *
 *   Gate 2 — BILLING_CHARGE_DRY_RUN != "true"
 *     Soft dry-run mode. When "true": logs CHARGE_DRY_RUN per subscription and writes nothing.
 *
 * ── Execution mode (after both gates pass) ────────────────────────────────────
 *   RECURRING_BILLING_PROVIDER=stub → full DB flow, no provider network call (both rails).
 *   unset/other → real charge via the provider charger.
 *
 * ── Grow participation gate ───────────────────────────────────────────────────
 *   ENABLE_GROW_RECURRING_CHARGES=true → the Grow scan runs (separate from checkout's
 *   GROW_SAAS_ENABLED). When off, NO Grow subscriptions are scanned → HYP unaffected.
 *
 * ── Eligibility criteria ─────────────────────────────────────────────────────
 *   plan          IN (STANDARD, GROWTH, PRO)    ← AGENCY uses custom billing
 *   status        IN (TRIALING, ACTIVE, PAST_DUE)
 *   nextBillingAt <= now()
 *   HYP:  billingProvider="hyp"  AND chargeToken IS NOT NULL
 *   Grow: billingProvider="grow" AND growSaasChargeSecretRef IS NOT NULL (gated)
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 *   Primary:   a successful charge advances nextBillingAt → a second run finds it not-due.
 *   Secondary: before creating a PENDING row, check for an existing PENDING/SUCCEEDED
 *              BillingCharge with the same periodStart; plus a DB @@unique([subscriptionId,
 *              periodStart]) P2002 guard against concurrent cron invocations.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   HYP chargeToken is fetched in a targeted query (HYP-only preflight), never selected into
 *   the broad scan. The Grow cardToken is never touched here — it is loaded + revealed only
 *   inside the Grow .http.ts. Raw provider response bodies are never stored or logged.
 */

import { prisma }                                                       from "@/lib/prisma";
import { PLAN_AMOUNTS, PLAN_LABELS, BILLABLE_PLANS, type BillablePlan } from "./amounts";
import { getRecurringCharger, type RecurringChargeContext, type RecurringChargeOutcome } from "./recurring-chargers";
import { isGrowSaasRecurringEnabled }                                   from "./providers/grow/config";
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

/**
 * Re-arm delay for the "error" outcome (integration fault — config/transport/token), NOT a
 * card decline. MUST be > 0 so the re-armed periodStart differs from the current one (a NEW
 * BillingCharge row next run — a FAILED row at the same periodStart would self-block via
 * @@unique), and WELL UNDER the cron interval so the sub is picked up at the very next run and
 * not phase-skipped past the daily 06:00 tick. With the current daily cron, effective retry
 * cadence ≈ the next daily run.
 */
const ERROR_RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour

// ── Result shape ──────────────────────────────────────────────────────────────

/** Per-provider charged/failed/errored breakdown (transition observability). */
export interface ProviderCounts {
  charged: number;
  failed:  number;
  errored: number;
}

export interface RecurringChargeResult {
  /** All subscriptions where nextBillingAt <= now (HYP with-token + Grow + HYP no-token). */
  eligible:           number;
  /** Charge succeeded (provider reported paid). */
  charged:            number;
  /** Card declined — counts as a dunning failure. */
  failed:             number;
  /** No charge attempted (idempotency skip, missing token/expiry, non-billable plan, gate off). */
  skipped:            number;
  /** Integration fault (config/transport/token) — re-armed, NOT dunned. */
  errored:            number;
  /** Due HYP subs missing chargeToken — cannot charge; needs investigation. */
  noToken:            number;
  /** Subscriptions logged as CHARGE_DRY_RUN (only when BILLING_CHARGE_DRY_RUN=true). */
  dryRunLogged:       number;
  /** Whether BILLING_CHARGE_DRY_RUN=true was active for this run. */
  dryRunMode:         boolean;
  /** Whether ENABLE_REAL_RECURRING_CHARGES=true was active for this run. */
  realChargesEnabled: boolean;
  /** Stub-vs-real execution switch: "stub" (no provider call) or "hyp"/real. */
  recurringProvider:  "stub" | "hyp";
  /** Whether the Grow recurring scan ran (ENABLE_GROW_RECURRING_CHARGES). */
  growRecurringEnabled: boolean;
  /** Per-provider counters. */
  byProvider:         { hyp: ProviderCounts; grow: ProviderCounts };
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

  // ── Read safety gates + execution mode (all runtime process.env) ──────────
  const realChargesEnabled = process.env.ENABLE_REAL_RECURRING_CHARGES === "true";
  const isDryRun           = process.env.BILLING_CHARGE_DRY_RUN === "true";

  // RECURRING_BILLING_PROVIDER=stub → full DB flow, no provider network call (both rails).
  const rawProvider       = process.env.RECURRING_BILLING_PROVIDER?.trim().toLowerCase();
  const recurringProvider = rawProvider === "stub" ? "stub" : "hyp";
  const stubMode          = recurringProvider === "stub";
  // Grow participation gate (separate from checkout's GROW_SAAS_ENABLED). When off, the Grow
  // scan is skipped entirely → zero Grow behavior, HYP unaffected.
  const growRecurringEnabled = isGrowSaasRecurringEnabled();

  console.log(
    `[billing/recurring] SCAN_START` +
    ` at=${now.toISOString()}` +
    ` realChargesEnabled=${realChargesEnabled}` +
    ` isDryRun=${isDryRun}` +
    ` recurringProvider=${recurringProvider}` +
    ` growRecurringEnabled=${growRecurringEnabled}`,
  );

  // ── Scan: due HYP subs + chargeToken present (TEMPORARY(hyp-removal)) ─────
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

  // ── Scan: due HYP subs but no chargeToken ─────────────────────────────────
  const noTokenCount = await prisma.subscription.count({
    where: {
      billingProvider: "hyp",
      plan:            { in: ["STANDARD", "GROWTH", "PRO"] },
      status:          { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      nextBillingAt:   { lte: now },
      chargeToken:     null,
    },
  });

  // ── Scan: due Grow subs (gated; skipped entirely when Grow recurring is off) ──
  // growSaasChargeSecretRef is an opaque handle (safe to select); the cardToken itself is
  // loaded later, inside the Grow .http.ts reveal site — never here.
  const growDue = growRecurringEnabled
    ? await prisma.subscription.findMany({
        where: {
          billingProvider:         "grow",
          plan:                    { in: ["STANDARD", "GROWTH", "PRO"] },
          status:                  { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
          nextBillingAt:           { lte: now },
          growSaasChargeSecretRef: { not: null },
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
        },
      })
    : [];

  // Merge both rails into one due list, tagged by provider. The HYP query above is byte-identical
  // to its pre-transition form; the Grow rows are additive and gated. The loop dispatches per provider.
  const due = [
    ...dueWithToken.map((s) => ({ ...s, billingProvider: "hyp" as const })),
    ...growDue.map((s)      => ({ ...s, billingProvider: "grow" as const })),
  ];

  const eligible = due.length + noTokenCount;

  console.log(
    `[billing/recurring] SCAN_RESULT` +
    ` eligible=${eligible}` +
    ` hypWithToken=${dueWithToken.length}` +
    ` growDue=${growDue.length}` +
    ` noToken=${noTokenCount}`,
  );

  if (noTokenCount > 0) {
    console.warn(
      `[billing/recurring] NO_TOKEN_WARNING` +
      ` count=${noTokenCount}` +
      ` — HYP subscriptions are due but missing chargeToken.`,
    );
  }

  // ── Per-subscription charge loop ──────────────────────────────────────────

  let charged      = 0;
  let failed       = 0;
  let skipped      = 0;
  let errored      = 0;
  let dryRunLogged = 0;
  const byProvider = {
    hyp:  { charged: 0, failed: 0, errored: 0 },
    grow: { charged: 0, failed: 0, errored: 0 },
  };

  for (const sub of due) {
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
        ` provider=${sub.billingProvider}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` plan=${sub.plan}` +
        ` interval=${sub.billingInterval}` +
        ` amountShekels=${amountShekels}` +
        ` status=${sub.status}` +
        ` nextBillingAt=${periodStart.toISOString()}` +
        ` billingFailures=${sub.billingFailures}`,
      );
      dryRunLogged++;
      continue;
    }

    // ── Gate 1: ENABLE_REAL_RECURRING_CHARGES (applies to both providers) ──
    // Checked AFTER DRY_RUN so dry-run still works when the real-charge flag is off.
    if (!realChargesEnabled) {
      console.log(
        `[billing/recurring] REAL_CHARGES_DISABLED` +
        ` provider=${sub.billingProvider}` +
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

    // ── HYP-only preflight (TEMPORARY(hyp-removal)) ────────────────────────
    // Runs BEFORE the PENDING create so a missing token/expiry skips WITHOUT leaving a
    // spurious PENDING row (which would occupy the @@unique slot forever). Grow has no
    // chargeToken column — its token is revealed later inside the Grow .http.ts.
    let hypChargeToken: string | null = null;
    if (sub.billingProvider === "hyp") {
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
      hypChargeToken = tokenRow.chargeToken;
    }

    // ── Pre-create PENDING BillingCharge ───────────────────────────────────
    // Created before the charge call so a crash between the call and the DB update still
    // leaves an audit record. P2002 on @@unique([subscriptionId, periodStart]) → idempotent skip.
    let charge: { id: string };
    try {
      charge = await prisma.billingCharge.create({
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
    } catch (createErr: unknown) {
      const isUniqueViolation =
        typeof createErr === "object" &&
        createErr !== null &&
        "code" in createErr &&
        (createErr as { code: unknown }).code === "P2002";

      if (isUniqueViolation) {
        console.log(
          `[billing/recurring] IDEMPOTENCY_SKIP_P2002` +
          ` subscriptionId=${sub.id}` +
          ` periodStart=${periodStart.toISOString()}` +
          ` — unique constraint blocked duplicate charge row (concurrent cron invocation)`,
        );
        skipped++;
        continue;
      }

      // Any other create error — propagate so the outer try/catch logs it.
      throw createErr;
    }

    const planLabel     = PLAN_LABELS[planKey];
    const intervalLabel = sub.billingInterval === "YEARLY" ? "שנתי" : "חודשי";

    console.log(
      `[billing/recurring] CHARGE_ATTEMPT` +
      ` provider=${sub.billingProvider}` +
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

    // ── Execute charge through the provider-neutral seam ───────────────────
    // recurring.ts NEVER calls callHypSoft or the Grow .http.ts directly — the charger owns the
    // provider call and returns a neutral RecurringChargeOutcome. Stub mode runs the full DB flow
    // with no provider network call.
    const ctx: RecurringChargeContext = {
      billingProvider: sub.billingProvider,
      subscriptionId:  sub.id,
      userId:          sub.userId,
      chargeId:        charge.id,
      amountAgorot,
      amountShekels,
      info:            `${planLabel} · ${intervalLabel}`,
      hypChargeToken,                       // HYP-only; null for Grow
      hypCardExpMonth: sub.cardExpMonth,
      hypCardExpYear:  sub.cardExpYear,
    };
    const result: RecurringChargeOutcome = await getRecurringCharger(
      sub.billingProvider,
      stubMode ? "stub" : "real",
    ).charge(ctx);

    // ── Success path ───────────────────────────────────────────────────────
    if (result.ok) {
      await prisma.$transaction(async (tx) => {
        await tx.billingCharge.update({
          where: { id: charge.id },
          data: {
            status: "SUCCEEDED",
            // Provider-scoped columns. growRaw/hypRaw never stored.
            ...(sub.billingProvider === "grow"
              ? { growStatusCode: result.providerCode, growTransId: result.providerTxId, growApprovalCode: result.authCode }
              : { hypCCode: result.providerCode, hypTransId: result.providerTxId, hypAuthCode: result.authCode }),
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
              chargeId: charge.id,
              // provider-scoped tx id key (HYP keeps hypTransId; Grow uses growTransId)
              ...(sub.billingProvider === "grow"
                ? { growTransId: result.providerTxId }
                : { hypTransId: result.providerTxId }),
              amountAgorot,
              plan:        sub.plan,
              interval:    sub.billingInterval,
              periodStart: periodStart.toISOString(),
              periodEnd:   periodEnd.toISOString(),
            }),
          },
        });
      });

      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.payment.succeeded",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          provider:        sub.billingProvider,
          plan:            sub.plan,
          billingInterval: sub.billingInterval,
          amountAgorot,
          chargeId:        charge.id,
          fromStatus:      sub.status,
        },
      });

      if (sub.status === "TRIALING") {
        await logAuditEvent({
          userId:     sub.userId,
          action:     "subscription.activated",
          entityType: "subscription",
          entityId:   sub.id,
          metadata:   {
            provider:        sub.billingProvider,
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
        ` provider=${sub.billingProvider}` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` providerCode="${result.providerCode}"` +
        ` hasTxId=${Boolean(result.providerTxId)}` +
        ` amountShekels=${amountShekels}` +
        ` nextBillingAt=${periodEnd.toISOString()}`,
      );
      charged++;
      byProvider[sub.billingProvider].charged++;

    // ── Declined: card refused — counts as a dunning failure ──────────────
    } else if (result.failure === "declined") {
      const newFailures   = sub.billingFailures + 1;
      const isMaxFailures = newFailures >= MAX_BILLING_FAILURES;
      const retryDate     = computeRetryDate(now, newFailures);
      const newStatus     = isMaxFailures ? ("PAST_DUE" as const) : sub.status;

      await prisma.$transaction(async (tx) => {
        await tx.billingCharge.update({
          where: { id: charge.id },
          data: {
            status: "FAILED",
            ...(sub.billingProvider === "grow"
              ? { growStatusCode: result.providerCode, growTransId: result.providerTxId }
              : { hypCCode: result.providerCode, hypTransId: result.providerTxId }),
            nextRetryAt: retryDate,
          },
        });

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            billingFailures: newFailures,
            status:          newStatus,
            // Advance cursor to retry date, or null on PAST_DUE (NULL is never < now).
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
              chargeId: charge.id,
              ...(sub.billingProvider === "grow"
                ? { growStatusCode: result.providerCode }
                : { hypCCode: result.providerCode }),
              reasonTag:     result.reasonTag ?? null,
              attemptNumber: newFailures,
              isMaxFailures,
              retryDate:     retryDate?.toISOString() ?? null,
            }),
          },
        });
      });

      await logAuditEvent({
        userId:     sub.userId,
        action:     "subscription.payment.failed",
        entityType: "subscription",
        entityId:   sub.id,
        metadata:   {
          provider:        sub.billingProvider,
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

      // Dunning email (synchronous in cron context; never throws).
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
        ` provider=${sub.billingProvider}` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` providerCode="${result.providerCode}"` +
        ` newFailures=${newFailures}` +
        ` newStatus=${newStatus}` +
        ` retryDate=${retryDate?.toISOString() ?? "(none — PAST_DUE)"}`,
      );
      failed++;
      byProvider[sub.billingProvider].failed++;

    // ── Error: integration fault (config/transport/token) — do NOT dun ────
    } else {
      // Re-arm a fresh periodStart so the next cron run creates a NEW BillingCharge row (a FAILED
      // row at the same periodStart would self-block via @@unique). billingFailures is NOT
      // incremented and NO dunning email is sent — this is our fault, not a card decline. Ops is
      // alarmed instead (CHARGE_ERROR + the errored counter surfaced by the cron route).
      const retryAt = new Date(now.getTime() + ERROR_RETRY_DELAY_MS);
      await prisma.$transaction(async (tx) => {
        await tx.billingCharge.update({
          where: { id: charge.id },
          data: {
            status: "FAILED",
            ...(sub.billingProvider === "grow"
              ? { growStatusCode: result.reasonTag ?? result.providerCode ?? null }
              : { hypCCode: result.reasonTag ?? result.providerCode ?? null }),
            nextRetryAt: retryAt,
          },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: { nextBillingAt: retryAt }, // billingFailures + status unchanged
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            event:          "charge_error",
            fromPlan:       sub.plan,
            toPlan:         sub.plan,
            fromStatus:     sub.status,
            toStatus:       sub.status,
            source:         "cron",
            actorId:        null,
            metadata: JSON.stringify({
              chargeId:     charge.id,
              reasonTag:    result.reasonTag ?? null,
              providerCode: result.providerCode ?? null,
              retryAt:      retryAt.toISOString(),
            }),
          },
        });
      });

      console.error(
        `[billing/recurring] CHARGE_ERROR` +
        ` provider=${sub.billingProvider}` +
        ` chargeId=${charge.id}` +
        ` subscriptionId=${sub.id}` +
        ` userId=${sub.userId}` +
        ` reasonTag=${result.reasonTag ?? "(none)"}` +
        ` retryAt=${retryAt.toISOString()}` +
        ` — integration fault; no dunning, billingFailures unchanged`,
      );
      errored++;
      byProvider[sub.billingProvider].errored++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(
    `[billing/recurring] SCAN_COMPLETE` +
    ` eligible=${eligible}` +
    ` charged=${charged}` +
    ` failed=${failed}` +
    ` errored=${errored}` +
    ` skipped=${skipped}` +
    ` dryRunLogged=${dryRunLogged}` +
    ` noToken=${noTokenCount}` +
    ` realChargesEnabled=${realChargesEnabled}` +
    ` isDryRun=${isDryRun}` +
    ` recurringProvider=${recurringProvider}` +
    ` growRecurringEnabled=${growRecurringEnabled}` +
    ` byProvider=${JSON.stringify(byProvider)}`,
  );

  return {
    eligible,
    charged,
    failed,
    skipped,
    errored,
    noToken:            noTokenCount,
    dryRunLogged,
    dryRunMode:         isDryRun,
    realChargesEnabled,
    recurringProvider,
    growRecurringEnabled,
    byProvider,
  };
}

// ── Helper: email broker on subscription payment failure (never throws) ────────
// Called synchronously in the cron billing loop — after() is not available outside Next.js
// route handlers. Errors are swallowed so a send failure never interrupts the charge loop.

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

    // Fetch broker name + email — not in the subscription select to avoid loading PII per row.
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

    // Create PENDING record before the network call so a mid-flight crash leaves a record.
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
