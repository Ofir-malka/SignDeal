/**
 * @/lib/payments/reconcile — Stale PENDING payment reconciliation.
 *
 * Finds Payment rows that are stuck in PENDING because a Stripe webhook was
 * missed or not processed, then corrects their state by querying Stripe directly.
 *
 * ── Problem this solves ────────────────────────────────────────────────────────
 * Stripe's checkout.session.expired and checkout.session.completed webhooks are
 * delivered at-least-once but not guaranteed — a cold-start Vercel crash, a
 * network blip, or a DB timeout during the handler can leave a Payment row stuck
 * at PENDING even after the Stripe session is resolved.
 *
 * Symptom: Payment.status = PENDING, Contract.status = PAYMENT_PENDING, and
 * Stripe reports the session as "expired" or "complete". The broker cannot
 * create a new payment request because the guard returns the stale PENDING row.
 * The client cannot pay again. The deal is frozen.
 *
 * ── What this module does ──────────────────────────────────────────────────────
 * Scans Payment rows where:
 *   status                  = PENDING
 *   stripeCheckoutSessionId IS NOT NULL
 *   createdAt               < (now − 25 hours)
 *
 * 25-hour threshold: Stripe checkout sessions expire after 24 hours by default.
 * The extra hour avoids a race between a session expiring and our cron running.
 *
 * For each row:
 *   session.status = "open"     → session still alive; skip.
 *   session.status = "expired"  → mark Payment = CANCELED.
 *   session.status = "complete" → recover full PAID state (PI + transfer ID).
 *   Stripe API error            → log + Sentry; skip this row; continue others.
 *
 * ── "complete" recovery ────────────────────────────────────────────────────────
 * Replicates exactly what handleCheckoutSessionCompleted does in the webhook:
 *   1. Extract PaymentIntent ID from session.payment_intent.
 *   2. Retrieve the PI with expand: ["latest_charge"] to get the transfer ID.
 *   3. Atomic $transaction: Payment → PAID, Contract → PAID (updateMany guard).
 *   4. logAuditEvent("contract.payment.paid") with source = "reconcile".
 *
 * Broker notification (SMS / email) is NOT sent from the reconciliation path.
 * Rationale: the checkout.session.completed webhook fires the notification
 * synchronously; if the webhook was missed entirely, the broker still sees the
 * PAID badge in the dashboard and can contact the client directly.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────────
 * Each DB update uses a status guard (`status: { in: ["PENDING"] }` or
 * `$transaction` with a prior status check) so running the cron twice for the
 * same row is safe. Stripe API calls are read-only.
 *
 * ── Failure isolation ─────────────────────────────────────────────────────────
 * Each Payment row is processed independently. An error on one row is captured
 * in Sentry and recorded in the result's `failures` array, then the loop
 * continues to the next row. The cron always returns a result.
 */

import type Stripe               from "stripe";
import { prisma }                from "@/lib/prisma";
import { getStripeClient }       from "@/lib/stripe";
import { logAuditEvent }         from "@/lib/audit/log-audit-event";
import * as Sentry               from "@sentry/nextjs";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconcileAction =
  | "paid"                   // session was complete; Payment recovered to PAID
  | "canceled"               // session was expired; Payment set to CANCELED
  | "skipped_open"           // session still open; no action needed
  | "skipped_already_resolved"  // Payment status changed between query and update (race)
  | "skipped_stripe_unavailable" // Stripe client not configured (env missing)
  | "failed";                // Stripe API or DB error

export interface ReconcileDetail {
  paymentId:  string;
  contractId: string;
  sessionId:  string;
  action:     ReconcileAction;
  error?:     string;
}

export interface ReconcileResult {
  /** ISO timestamp of when the job started. */
  ranAt:             string;
  /** Total Payment rows found in stale-PENDING state. */
  inspected:         number;
  /** Payments recovered to PAID (webhook was missed after client paid). */
  correctedComplete: number;
  /** Payments set to CANCELED (session expired, webhook missed). */
  correctedExpired:  number;
  /** Sessions still open — no action taken. */
  skippedOpen:       number;
  /** Rows where Stripe API or DB threw; processing continued for others. */
  failures:          number;
  /** Per-row detail log for structured logging and admin inspection. */
  details:           ReconcileDetail[];
}

// ── Threshold ─────────────────────────────────────────────────────────────────

/** Payment rows older than this many hours are eligible for reconciliation.
 *  25 h = Stripe's 24 h session TTL + 1 h safety buffer. */
const STALE_THRESHOLD_HOURS = 25;

// ── Core function ─────────────────────────────────────────────────────────────

export async function runPaymentReconciliation(): Promise<ReconcileResult> {
  const ranAt   = new Date().toISOString();
  const details: ReconcileDetail[] = [];

  // ── Stripe client — bail early if not configured ──────────────────────────
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[payment-reconcile] Stripe client unavailable — ${msg}` +
      ` (PAYMENT_PROVIDER may not be "stripe"; skipping all rows)`,
    );
    // Return a clean result — this is not an error when running on Rapyd/stub.
    return {
      ranAt,
      inspected:         0,
      correctedComplete: 0,
      correctedExpired:  0,
      skippedOpen:       0,
      failures:          0,
      details:           [],
    };
  }

  // ── Query: stale PENDING payments with a Stripe session ID ───────────────
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const stalePayments = await prisma.payment.findMany({
    where: {
      status:                  "PENDING",
      stripeCheckoutSessionId: { not: null },
      createdAt:               { lt: cutoff },
    },
    select: {
      id:                      true,
      contractId:              true,
      stripeCheckoutSessionId: true,
    },
  });

  console.log(
    `[payment-reconcile] found ${stalePayments.length} stale PENDING payment(s)` +
    ` older than ${STALE_THRESHOLD_HOURS}h cutoff=${cutoff.toISOString()}`,
  );

  // ── Process each row independently ───────────────────────────────────────
  for (const payment of stalePayments) {
    const sessionId = payment.stripeCheckoutSessionId!; // non-null by query filter

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.status === "open") {
        // Session still alive — no action.
        console.log(
          `[payment-reconcile] paymentId=${payment.id} sessionId=${sessionId}` +
          ` status=open → skip`,
        );
        details.push({ paymentId: payment.id, contractId: payment.contractId, sessionId, action: "skipped_open" });
        continue;
      }

      if (session.status === "expired") {
        await recoverExpired(payment, sessionId);
        details.push({ paymentId: payment.id, contractId: payment.contractId, sessionId, action: "canceled" });
        continue;
      }

      if (session.status === "complete") {
        const recovered = await recoverComplete(stripe, payment, session);
        details.push({
          paymentId:  payment.id,
          contractId: payment.contractId,
          sessionId,
          action:     recovered ? "paid" : "skipped_already_resolved",
        });
        continue;
      }

      // Unknown session status — log but don't throw.
      console.warn(
        `[payment-reconcile] paymentId=${payment.id} sessionId=${sessionId}` +
        ` unknown session.status="${session.status}" — skipping`,
      );
      details.push({ paymentId: payment.id, contractId: payment.contractId, sessionId, action: "skipped_open" });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[payment-reconcile] paymentId=${payment.id} sessionId=${sessionId} FAILED: ${msg}`,
      );
      Sentry.captureException(err, {
        level: "error",
        tags:  { component: "payment_reconcile_cron" },
        extra: { paymentId: payment.id, contractId: payment.contractId, sessionId },
      });
      details.push({ paymentId: payment.id, contractId: payment.contractId, sessionId, action: "failed", error: msg });
    }
  }

  // ── Aggregate counts ─────────────────────────────────────────────────────
  const correctedComplete = details.filter(d => d.action === "paid").length;
  const correctedExpired  = details.filter(d => d.action === "canceled").length;
  const skippedOpen       = details.filter(d => d.action === "skipped_open" || d.action === "skipped_already_resolved").length;
  const failures          = details.filter(d => d.action === "failed").length;

  // ── Sentry alert if any rows were corrected (unusual — indicates missed webhooks)
  if (correctedComplete > 0 || correctedExpired > 0) {
    Sentry.captureMessage(
      `Payment reconciliation corrected ${correctedComplete + correctedExpired} stale row(s)` +
      ` (paid=${correctedComplete} canceled=${correctedExpired})`,
      {
        level: "warning",
        tags:  { component: "payment_reconcile_cron" },
        extra: { correctedComplete, correctedExpired, inspected: stalePayments.length },
      },
    );
  }

  return {
    ranAt,
    inspected:         stalePayments.length,
    correctedComplete,
    correctedExpired,
    skippedOpen,
    failures,
    details,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mark a Payment CANCELED because its Stripe session expired without payment.
 * Mirrors handleCheckoutSessionExpired in the webhook, but with source="reconcile".
 * Contract stays PAYMENT_PENDING — broker can re-send a payment request.
 */
async function recoverExpired(
  payment:   { id: string; contractId: string },
  sessionId: string,
): Promise<void> {
  // updateMany with status guard = idempotent if the webhook already ran.
  const result = await prisma.payment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data:  { status: "CANCELED" },
  });

  if (result.count === 0) {
    // Status changed between the findMany query and now — another process
    // (the real webhook) already resolved this row. Safe to skip.
    console.log(
      `[payment-reconcile] paymentId=${payment.id} already resolved — skipping expired recovery`,
    );
    return;
  }

  await logAuditEvent({
    userId:     null,
    action:     "contract.payment.expired",
    entityType: "payment",
    entityId:   payment.id,
    metadata:   {
      provider:  "stripe",
      sessionId,
      source:    "reconcile",   // distinguishes cron-driven from webhook-driven
    },
  });

  console.log(
    `[payment-reconcile] ✓ paymentId=${payment.id} → CANCELED (expired)` +
    ` sessionId=${sessionId}`,
  );
}

/**
 * Recover a Payment to PAID because its Stripe session is complete but the
 * checkout.session.completed webhook was not processed.
 *
 * Replicates handleCheckoutSessionCompleted exactly:
 *   1. Extract PaymentIntent ID.
 *   2. Retrieve PI with expand: ["latest_charge"] to get the transfer ID.
 *   3. $transaction: Payment → PAID, Contract → PAID.
 *   4. Audit log with source="reconcile".
 *
 * Returns true when the row was updated, false when it was already resolved.
 */
async function recoverComplete(
  stripe:   ReturnType<typeof getStripeClient>,
  payment:  { id: string; contractId: string },
  session:  Stripe.Checkout.Session,
): Promise<boolean> {
  const piId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;

  // Attempt to fetch transfer ID from the PaymentIntent.
  // Destination charges have the transfer set synchronously at payment time.
  let stripeTransferId: string | null = null;
  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== "string") {
        const transferField = (charge as Stripe.Charge & {
          transfer?: string | { id: string } | null;
        }).transfer;
        if (typeof transferField === "string") {
          stripeTransferId = transferField;
        } else if (transferField && typeof transferField === "object" && "id" in transferField) {
          stripeTransferId = (transferField as { id: string }).id;
        }
      }
    } catch (err) {
      // Non-fatal — we can set PAID without the transfer ID.
      console.warn(
        `[payment-reconcile] could not retrieve PI ${piId} for transfer ID:`,
        err,
      );
    }
  }

  const paidAt = new Date();

  // Atomic update — mirrors webhook $transaction pattern.
  // The status guard inside updateMany makes this idempotent.
  let paymentUpdated = false;
  await prisma.$transaction(async (tx) => {
    const result = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data:  {
        status:                "PAID",
        paidAt,
        providerPaymentId:     piId            ?? undefined,
        stripePaymentIntentId: piId            ?? undefined,
        stripeTransferId:      stripeTransferId ?? undefined,
      },
    });

    if (result.count === 0) {
      // Already resolved by the real webhook or a concurrent cron run.
      return;
    }

    paymentUpdated = true;

    // Advance Contract only when the Payment row was actually changed.
    await tx.contract.updateMany({
      where: { id: payment.contractId, status: { in: ["PAYMENT_PENDING", "SIGNED", "OPENED"] } },
      data:  { status: "PAID" },
    });
  });

  if (!paymentUpdated) {
    console.log(
      `[payment-reconcile] paymentId=${payment.id} already resolved — skipping complete recovery`,
    );
    return false;
  }

  await logAuditEvent({
    userId:     null,
    action:     "contract.payment.paid",
    entityType: "payment",
    entityId:   payment.id,
    metadata:   {
      provider:        "stripe",
      contractId:      payment.contractId,
      piId,
      stripeTransferId,
      sessionId:       session.id,
      source:          "reconcile",   // distinguishes cron-driven from webhook-driven
    },
  });

  console.log(
    `[payment-reconcile] ✓ paymentId=${payment.id} → PAID (recovered)` +
    ` sessionId=${session.id}` +
    ` piId=${piId ?? "n/a"}` +
    ` transferId=${stripeTransferId ?? "n/a"}`,
  );

  return true;
}
