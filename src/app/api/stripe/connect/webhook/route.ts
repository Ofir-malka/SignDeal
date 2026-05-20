/**
 * POST /api/stripe/connect/webhook
 *
 * Receives Stripe Connect webhook events and syncs broker account state to the DB.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * There is no session authentication here — Stripe calls this endpoint directly.
 * Authentication is performed SOLELY by verifying the stripe-signature header
 * HMAC before any DB access. Raw body must be read with request.text() before
 * any parsing; JSON parsing destroys the raw bytes used in the HMAC.
 *
 * ── Events handled ───────────────────────────────────────────────────────────
 *   account.updated   — syncs chargesEnabled, payoutsEnabled, detailsSubmitted,
 *                       and onboardingStatus to BrokerStripeAccount.
 *   payout.created    — upserts a StripePayoutEvent row with status="pending".
 *   payout.paid       — updates status="paid", sets arrivalDate, then reconciles:
 *                       queries Stripe balance transactions for this payout and
 *                       links matching Payment rows via stripeTransferId → payoutId.
 *   payout.failed     — updates status="failed", stores failureCode + failureMessage.
 *   payout.canceled   — updates status="canceled".
 *
 * Payout events fire on the CONNECTED ACCOUNT (broker's Express account), not the
 * platform.  event.account holds the connected account ID (acct_...).
 *
 * All other event types are logged and ignored (200 returned).
 *
 * ── Retry safety ─────────────────────────────────────────────────────────────
 * Stripe retries on any non-2xx response. This handler returns 200 for:
 *   • Signature failure (400 — Stripe does NOT retry on 4xx; we can be strict here)
 *   • DB errors (200 — prevents Stripe from retrying a broken write indefinitely)
 *   • Unknown event types (200 — safe to ignore)
 *   • account.updated for an unknown stripeAccountId (200 — may be a test/dev event)
 *
 * ── Dashboard configuration ───────────────────────────────────────────────────
 * Register this endpoint in the Stripe Dashboard → Webhooks with event:
 *   • account.updated
 *
 * For local development, use the Stripe CLI:
 *   stripe listen --forward-to localhost:3000/api/stripe/connect/webhook
 *
 * ⚠ This is for Stripe Connect (client-to-broker payments) only.
 *   HYP SaaS billing webhooks go through /billing/success (browser redirect), not a webhook.
 */

import { NextResponse }                          from "next/server";
import type Stripe                               from "stripe";
import * as Sentry                               from "@sentry/nextjs";
import { getStripeClient, syncBrokerStripeAccount, getStripeConfig } from "@/lib/stripe";
import { prisma }                                from "@/lib/prisma";

export async function POST(request: Request): Promise<NextResponse> {
  // ── Read raw body FIRST — must happen before any parsing ─────────────────
  // stripe.webhooks.constructEvent requires the original bytes to verify HMAC.
  const rawBody = await request.text();

  // ── Stripe signature header ───────────────────────────────────────────────
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    console.warn("[api/stripe/connect/webhook] missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // ── Stripe client + webhook secret ────────────────────────────────────────
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/stripe/connect/webhook] getStripeClient failed:", msg);
    // Return 200 — Stripe would retry forever if it got a 5xx; this is a
    // configuration error that requires a deploy, not a transient failure.
    return NextResponse.json({ received: true });
  }

  const { webhookSecret } = getStripeConfig();
  if (!webhookSecret) {
    console.error(
      "[api/stripe/connect/webhook] STRIPE_WEBHOOK_SECRET is not set — " +
      "all webhook events will be rejected. Set it in your .env file.",
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 400 });
  }

  // ── Verify HMAC signature ─────────────────────────────────────────────────
  // This is the ONLY authentication for this endpoint — no session, no userId.
  // constructEvent throws on invalid signature; we return 400 (Stripe won't retry 4xx).
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[api/stripe/connect/webhook] signature verification failed: ${msg}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Idempotency guard — write WebhookEvent row ───────────────────────────
  // @@unique([provider, eventId]) ensures duplicate Stripe deliveries are no-ops.
  // Mirrors the same pattern used in /api/stripe/payment/webhook.
  let webhookEventCreated = true;
  try {
    await prisma.webhookEvent.create({
      data: {
        provider:  "stripe_connect",
        eventId:   event.id,
        eventType: event.type,
        payload:   JSON.parse(rawBody) as object,
        status:    "RECEIVED",
      },
    });
  } catch (err: unknown) {
    // P2002 = Prisma unique constraint violation → duplicate event delivery
    const isUniqueViolation =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002";

    if (isUniqueViolation) {
      console.log(
        `[api/stripe/connect/webhook] duplicate event id="${event.id}"` +
        ` type="${event.type}" — returning 200 without reprocessing`,
      );
      return NextResponse.json({ received: true });
    }

    // Other DB error: log but continue — event processing may still succeed.
    webhookEventCreated = false;
    console.error(
      `[api/stripe/connect/webhook] WebhookEvent.create failed for event="${event.id}":`,
      err,
    );
  }

  // ── Dispatch on event type ────────────────────────────────────────────────
  let processingError: string | null = null;
  try {
    if (event.type === "account.updated") {
      await handleAccountUpdated(event.data.object as Stripe.Account);
    } else if (
      event.type === "payout.created"  ||
      event.type === "payout.paid"     ||
      event.type === "payout.failed"   ||
      event.type === "payout.canceled"
    ) {
      // Payout events fire on the connected (broker) account, not the platform.
      // event.account holds the acct_... ID of the account that generated the event.
      const stripeAccountId = event.account ?? null;
      if (!stripeAccountId) {
        console.warn(
          `[api/stripe/connect/webhook] payout event "${event.type}" has no account field — ignored`,
        );
      } else {
        await handlePayoutEvent(
          stripe,
          event.type,
          event.data.object as Stripe.Payout,
          stripeAccountId,
        );
      }
    } else {
      // All other events acknowledged but not processed
      console.log(`[api/stripe/connect/webhook] ignored event type="${event.type}" id="${event.id}"`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    processingError = msg;
    console.error(
      `[api/stripe/connect/webhook] handler error event="${event.type}" id="${event.id}": ${msg}`,
    );
    // Return 200 so Stripe does not retry — processing errors are logged for manual review.
    // A retry would likely produce the same error (e.g. Prisma connection failure).
  }

  // ── Update WebhookEvent status ────────────────────────────────────────────
  if (webhookEventCreated) {
    try {
      await prisma.webhookEvent.updateMany({
        where: { provider: "stripe_connect", eventId: event.id },
        data:  {
          status: processingError ? "FAILED"    : "PROCESSED",
          error:  processingError ?? undefined,
        },
      });
    } catch (err) {
      // Non-fatal — status update failing does not affect the event outcome.
      console.error(
        `[api/stripe/connect/webhook] WebhookEvent.update failed for event="${event.id}":`,
        err,
      );
    }
  }

  // Alert when a handler failed — revenue-impacting; Stripe will NOT retry (we return 200).
  if (processingError) {
    Sentry.captureMessage(
      `Stripe connect webhook handler failed: ${processingError}`,
      {
        level: "error",
        tags:  { component: "stripe_connect_webhook", eventType: event.type },
        extra: { eventId: event.id },
      },
    );
  }

  return NextResponse.json({ received: true });
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * payout.created / payout.paid / payout.failed / payout.canceled  (Phase D)
 *
 * Creates or updates a StripePayoutEvent row for the broker's payout lifecycle.
 * On payout.paid, also reconciles Stripe balance transactions to link Payment rows
 * to this payout via Payment.payoutId.
 *
 * @param stripe           — Stripe client (platform key, used with stripeAccount header for balance txs)
 * @param eventType        — the Stripe event type string
 * @param payout           — the Stripe Payout object from event.data.object
 * @param stripeAccountId  — the connected account ID from event.account (acct_...)
 */
async function handlePayoutEvent(
  stripe:          ReturnType<typeof getStripeClient>,
  eventType:       "payout.created" | "payout.paid" | "payout.failed" | "payout.canceled",
  payout:          Stripe.Payout,
  stripeAccountId: string,
): Promise<void> {
  // Guard: only handle payouts for known broker accounts
  const brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where:  { stripeAccountId },
    select: { id: true },
  });

  if (!brokerAccount) {
    console.log(
      `[handlePayoutEvent] no BrokerStripeAccount for acct=${stripeAccountId} — ignored` +
      ` (test account or external platform?)`,
    );
    return;
  }

  const payoutId = payout.id;  // "po_..."

  // Derive canonical status from event type (more reliable than payout.status alone,
  // which can lag during transitions).
  const statusByEvent: Record<string, string> = {
    "payout.created":  payout.status,  // typically "pending" or "in_transit"
    "payout.paid":     "paid",
    "payout.failed":   "failed",
    "payout.canceled": "canceled",
  };
  const status      = statusByEvent[eventType] ?? payout.status;
  // Stripe arrival_date is a Unix epoch integer (seconds) — convert to Date
  const arrivalDate = new Date(payout.arrival_date * 1000);

  await prisma.stripePayoutEvent.upsert({
    where:  { payoutId },
    create: {
      stripeAccountId,
      payoutId,
      status,
      amount:         payout.amount,
      currency:       payout.currency,
      arrivalDate,
      failureCode:    payout.failure_code    ?? undefined,
      failureMessage: payout.failure_message ?? undefined,
    },
    update: {
      status,
      arrivalDate,
      failureCode:    payout.failure_code    ?? undefined,
      failureMessage: payout.failure_message ?? undefined,
    },
  });

  console.log(
    `[handlePayoutEvent] ${eventType}` +
    ` payoutId=${payoutId} acct=${stripeAccountId} status=${status}` +
    ` amount=${payout.amount} arrivalDate=${arrivalDate.toISOString()}`,
  );

  // ── Reconciliation on payout.paid ──────────────────────────────────────────
  // Link Payment rows that were swept into this payout by querying the connected
  // account's balance transactions and matching on stripeTransferId.
  if (eventType === "payout.paid") {
    await reconcilePayoutPayments(stripe, payoutId, stripeAccountId);
  }
}

/**
 * On payout.paid: enumerate the payout's balance transactions on the connected
 * account and set Payment.payoutId on all matching rows.
 *
 * Each balance transaction from a destination charge appears with:
 *   type   = "payment" (received transfer from platform)
 *   source = "tr_..."  (the Stripe Transfer ID)
 *
 * We match bt.source against Payment.stripeTransferId and set payoutId.
 * The `payoutId: null` guard makes this idempotent on duplicate webhook delivery.
 */
async function reconcilePayoutPayments(
  stripe:          ReturnType<typeof getStripeClient>,
  payoutId:        string,
  stripeAccountId: string,
): Promise<void> {
  try {
    // List the connected account's balance transactions for this payout.
    // limit:100 is sufficient for Phase D test volumes; pagination can be added
    // for production brokers with high monthly transaction counts.
    const balanceTxs = await stripe.balanceTransactions.list(
      { payout: payoutId, limit: 100 },
      { stripeAccount: stripeAccountId },   // ← call on behalf of connected account
    );

    let linked = 0;

    for (const bt of balanceTxs.data) {
      const transferId = typeof bt.source === "string" ? bt.source : null;
      // Only process balance transactions sourced from a Transfer (tr_...)
      if (!transferId?.startsWith("tr_")) continue;

      const result = await prisma.payment.updateMany({
        where: { stripeTransferId: transferId, payoutId: null },
        data:  { payoutId },
      });

      linked += result.count;
    }

    console.log(
      `[reconcilePayoutPayments] payoutId=${payoutId} acct=${stripeAccountId}` +
      ` scanned=${balanceTxs.data.length} linked=${linked} payment(s)`,
    );
  } catch (err) {
    // Non-fatal: reconciliation failure does not affect payout status tracking.
    // The StripePayoutEvent row is already updated; Payment.payoutId stays null
    // until the next reconciliation attempt (e.g., via a future payout.paid retry).
    console.error(
      `[reconcilePayoutPayments] failed for payoutId=${payoutId} acct=${stripeAccountId}:`,
      err,
    );
  }
}

async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const stripeAccountId = account.id;

  // Use the shared sync function from stripe.ts.
  // lookupField="stripeAccountId" because we don't have a userId in webhook context.
  const result = await syncBrokerStripeAccount(stripeAccountId, "stripeAccountId");

  if (!result) {
    // No BrokerStripeAccount row for this acct_ — could be a test account or
    // a Stripe account created outside this platform. Safe to ignore.
    console.log(
      `[api/stripe/connect/webhook] account.updated for unknown acct=${stripeAccountId} — ignored`,
    );
    return;
  }

  console.log(
    `[api/stripe/connect/webhook] account.updated synced` +
    ` acct=${stripeAccountId}` +
    ` status=${result.onboardingStatus}` +
    ` charges=${result.chargesEnabled}` +
    ` payouts=${result.payoutsEnabled}`,
  );
}
