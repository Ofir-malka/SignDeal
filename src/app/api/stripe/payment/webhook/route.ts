/**
 * POST /api/stripe/payment/webhook
 *
 * Receives Stripe PLATFORM payment webhook events and syncs Payment / Contract
 * state to the DB.
 *
 * ── What this handles ────────────────────────────────────────────────────────
 *   checkout.session.completed   → Payment = PAID, Contract = PAID
 *                                   Stores stripePaymentIntentId + stripeTransferId.
 *   checkout.session.expired     → Payment = CANCELED (client never completed payment)
 *   payment_intent.payment_failed→ Payment = FAILED
 *                                   Note: for Checkout Sessions a failed card attempt
 *                                   keeps the session open (user can retry). We mark
 *                                   FAILED per spec; the session expired event fires
 *                                   if the user never succeeds.
 *   transfer.created             → Payment.transferStatus = "paid".  Lookup via
 *                                   stripeTransferId (fast) or source_transaction
 *                                   charge → PaymentIntent (fallback, one API call).
 *   transfer.reversed            → Payment.transferStatus = "reversed".  Minimal
 *                                   flag — full accounting is Phase E.
 *   All other event types        → logged and ignored (200 returned).
 *
 * ── How this differs from /api/stripe/connect/webhook ────────────────────────
 *   connect/webhook  — listens to Connect account.updated events.
 *                      Signed with STRIPE_WEBHOOK_SECRET.
 *   payment/webhook  — THIS FILE. Listens to platform Checkout Session events.
 *                      Signed with STRIPE_PAYMENT_WEBHOOK_SECRET.
 *   They are completely separate Stripe webhook endpoints with separate secrets.
 *   Register them as two different entries in the Stripe Dashboard.
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 * No session authentication — Stripe calls this endpoint directly.
 * Auth is solely via HMAC signature verification using STRIPE_PAYMENT_WEBHOOK_SECRET.
 * Raw body must be consumed with request.text() BEFORE any parsing.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Each event is written to WebhookEvent with @@unique([provider, eventId]).
 * If the INSERT fails with a unique constraint violation, the event is a
 * duplicate → return 200 immediately without reprocessing.
 * provider value used: "stripe_payment" (distinct from "rapyd" and any future providers).
 *
 * ── Retry safety ─────────────────────────────────────────────────────────────
 * Stripe retries on any non-2xx response.
 *   400 — returned only on bad signature (Stripe does NOT retry 4xx).
 *   200 — returned for all other cases, including handler errors, to prevent
 *          infinite retry loops on transient DB errors.
 *
 * ── Dashboard configuration ──────────────────────────────────────────────────
 * Register this endpoint in Stripe Dashboard → Webhooks:
 *   URL:    https://app.signdeal.co.il/api/stripe/payment/webhook
 *   Events: checkout.session.completed
 *           checkout.session.expired
 *           payment_intent.payment_failed
 *
 * For local development with Stripe CLI:
 *   stripe listen --forward-to localhost:3000/api/stripe/payment/webhook \
 *     --events checkout.session.completed,checkout.session.expired,payment_intent.payment_failed
 *
 * ⚠ Do NOT handle account.updated here — that belongs in /api/stripe/connect/webhook.
 * ⚠ Do NOT mix HYP billing events here — HYP uses /api/billing/hyp-notify.
 */

import { NextResponse, after }           from "next/server";
import type Stripe                       from "stripe";
import * as Sentry                       from "@sentry/nextjs";
import { getStripeClient, getStripeConfig } from "@/lib/stripe";
import { prisma }                        from "@/lib/prisma";
import { logAuditEvent }                 from "@/lib/audit/log-audit-event";
import { sendEmail, paymentReceivedEmail } from "@/lib/email";
import { parsePropertyAddress }          from "@/lib/format-address";

export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Read raw body FIRST — required for HMAC verification ─────────────────
  // stripe.webhooks.constructEvent requires the original byte string.
  // Any JSON parsing before this call destroys the bytes and breaks HMAC.
  const rawBody = await request.text();

  // ── 2. Stripe signature header ───────────────────────────────────────────────
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    console.warn("[api/stripe/payment/webhook] missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // ── 3. Stripe client + payment webhook secret ────────────────────────────────
  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/stripe/payment/webhook] getStripeClient failed:", msg);
    // Return 200 — this is a config error; retrying won't help.
    return NextResponse.json({ received: true });
  }

  const { paymentWebhookSecret } = getStripeConfig();
  if (!paymentWebhookSecret) {
    console.error(
      "[api/stripe/payment/webhook] STRIPE_PAYMENT_WEBHOOK_SECRET is not set — " +
      "all payment webhook events will be rejected. Set it in your .env file.",
    );
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 400 });
  }

  // ── 4. Verify HMAC signature ─────────────────────────────────────────────────
  // This is the ONLY authentication for this endpoint.
  // constructEvent throws on invalid signature; 400 → Stripe does NOT retry 4xx.
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, paymentWebhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[api/stripe/payment/webhook] signature verification failed: ${msg}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 5. Idempotency guard — write WebhookEvent row ───────────────────────────
  // @@unique([provider, eventId]) ensures duplicate deliveries are no-ops.
  let webhookEventCreated = true;
  try {
    await prisma.webhookEvent.create({
      data: {
        provider:  "stripe_payment",
        eventId:   event.id,
        eventType: event.type,
        payload:   JSON.parse(rawBody) as object,
        status:    "RECEIVED",
      },
    });
  } catch (err: unknown) {
    // P2002 = Prisma unique constraint violation → duplicate event
    const isUniqueViolation =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002";

    if (isUniqueViolation) {
      console.log(
        `[api/stripe/payment/webhook] duplicate event id="${event.id}"` +
        ` type="${event.type}" — returning 200 without reprocessing`,
      );
      return NextResponse.json({ received: true });
    }

    // Other DB error: log but continue — event processing may still succeed.
    webhookEventCreated = false;
    console.error(
      `[api/stripe/payment/webhook] WebhookEvent.create failed for event="${event.id}":`,
      err,
    );
  }

  // ── 6. Dispatch on event type ────────────────────────────────────────────────
  let processingError: string | null = null;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          stripe,
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "checkout.session.expired":
        await handleCheckoutSessionExpired(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          stripe,
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case "transfer.created":
        await handleTransferCreated(
          stripe,
          event.data.object as Stripe.Transfer,
        );
        break;

      case "transfer.reversed":
        await handleTransferReversed(
          event.data.object as Stripe.Transfer,
        );
        break;

      default:
        console.log(
          `[api/stripe/payment/webhook] ignored event type="${event.type}" id="${event.id}"`,
        );
    }
  } catch (err) {
    const msg        = err instanceof Error ? err.message : String(err);
    processingError  = msg;
    console.error(
      `[api/stripe/payment/webhook] handler error event="${event.type}" id="${event.id}": ${msg}`,
    );
  }

  // ── 7. Update WebhookEvent status ────────────────────────────────────────────
  if (webhookEventCreated) {
    try {
      await prisma.webhookEvent.updateMany({
        where: { provider: "stripe_payment", eventId: event.id },
        data:  {
          status: processingError ? "FAILED"    : "PROCESSED",
          error:  processingError ?? undefined,
        },
      });
    } catch (err) {
      // Non-fatal — the status update failing does not affect the payment outcome.
      console.error(
        `[api/stripe/payment/webhook] WebhookEvent.update failed for event="${event.id}":`,
        err,
      );
    }
  }

  // Alert when a handler failed — revenue-impacting; Stripe will NOT retry (we return 200).
  if (processingError) {
    Sentry.captureMessage(
      `Stripe payment webhook handler failed: ${processingError}`,
      {
        level: "error",
        tags:  { component: "stripe_payment_webhook", eventType: event.type },
        extra: { eventId: event.id },
      },
    );
  }

  // Always 200 after the 400 guard — prevents Stripe from retrying on our DB errors.
  return NextResponse.json({ received: true });
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 *
 * The client successfully paid. Advance Payment → PAID, Contract → PAID.
 * Store stripePaymentIntentId.  Attempt to retrieve the transfer ID from the
 * PaymentIntent (one extra API call; non-fatal if it fails).
 */
async function handleCheckoutSessionCompleted(
  stripe:  ReturnType<typeof getStripeClient>,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const sessionId = session.id;  // cs_...

  const payment = await prisma.payment.findFirst({
    where:  { stripeCheckoutSessionId: sessionId },
    select: { id: true, contractId: true, status: true },
  });

  if (!payment) {
    console.log(
      `[handleCheckoutSessionCompleted] no Payment found for session=${sessionId} — ignored` +
      ` (may be a test or external session)`,
    );
    return;
  }

  if (payment.status === "PAID") {
    console.log(
      `[handleCheckoutSessionCompleted] payment ${payment.id} already PAID — idempotent skip`,
    );
    return;
  }

  // Extract PaymentIntent ID (string for mode=payment; null for subscription mode)
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : null;

  // Attempt to retrieve the transfer ID from the PaymentIntent.
  // For destination charges, Stripe creates the transfer synchronously at payment
  // time, so it should be available here.  Non-fatal if the retrieve fails.
  let stripeTransferId: string | null = null;
  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== "string") {
        // charge.transfer is a string ID or an expanded Transfer object
        const transferField = (charge as Stripe.Charge & { transfer?: string | { id: string } | null }).transfer;
        if (typeof transferField === "string") {
          stripeTransferId = transferField;
        } else if (transferField && typeof transferField === "object" && "id" in transferField) {
          stripeTransferId = (transferField as { id: string }).id;
        }
      }
    } catch (err) {
      console.warn(
        `[handleCheckoutSessionCompleted] could not retrieve PI ${piId} for transfer ID:`,
        err,
      );
    }
  }

  const paidAt = new Date();

  // Atomically update Payment + Contract to prevent a partial-success state
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data:  {
        status:                "PAID",
        paidAt,
        providerPaymentId:     piId     ?? undefined,
        stripePaymentIntentId: piId     ?? undefined,
        stripeTransferId:      stripeTransferId ?? undefined,
      },
    });

    // updateMany with status guard — idempotent if Contract is already PAID
    await tx.contract.updateMany({
      where: { id: payment.contractId, status: { in: ["PAYMENT_PENDING", "SIGNED", "OPENED"] } },
      data:  { status: "PAID" },
    });
  });

  // ── Audit log: payment paid ──────────────────────────────────────────────────
  // userId is null — this is a system webhook, no broker session.
  // amount_total and currency come from the Stripe session object; no secrets logged.
  await logAuditEvent({
    userId:     null,
    action:     "contract.payment.paid",
    entityType: "payment",
    entityId:   payment.id,
    metadata:   {
      provider:   "stripe",
      contractId: payment.contractId,
      amount:     session.amount_total ?? null,
      currency:   session.currency    ?? null,
      eventType:  "checkout.session.completed",
    },
  });

  // ── Email broker: payment received — deferred via after() ───────────────────
  // Runs after the 200 is returned to Stripe. Never delays webhook response.
  // sendBrokerPaidEmail never throws — errors are swallowed so the webhook
  // always returns 200 regardless of email delivery outcome.
  after(async () => {
    await sendBrokerPaidEmail(payment.contractId, payment.id, paidAt);
  });

  console.log(
    `[handleCheckoutSessionCompleted] ✓ payment=${payment.id} → PAID` +
    ` piId=${piId ?? "n/a"}` +
    ` transferId=${stripeTransferId ?? "n/a"}` +
    ` contractId=${payment.contractId}`,
  );
}

/**
 * checkout.session.expired
 *
 * The client never completed payment within Stripe's session TTL (default 24 h).
 * Advance Payment → CANCELED.  Contract stays PAYMENT_PENDING — the broker can
 * trigger a new payment request.
 */
async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const sessionId = session.id;

  const payment = await prisma.payment.findFirst({
    where:  { stripeCheckoutSessionId: sessionId },
    select: { id: true, status: true },
  });

  if (!payment) {
    console.log(
      `[handleCheckoutSessionExpired] no Payment found for session=${sessionId} — ignored`,
    );
    return;
  }

  if (payment.status !== "PENDING") {
    console.log(
      `[handleCheckoutSessionExpired] payment ${payment.id} is ${payment.status} — skip`,
    );
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data:  { status: "CANCELED" },
  });

  console.log(
    `[handleCheckoutSessionExpired] payment=${payment.id} → CANCELED session=${sessionId}`,
  );
}

/**
 * transfer.created  (Phase D)
 *
 * A Stripe Transfer was created, meaning funds moved from the platform account
 * to the broker's Express account.  Set Payment.transferStatus = "paid".
 *
 * Lookup order:
 *   1. By stripeTransferId = transfer.id — fast, works when checkout.session.completed
 *      already fired and set stripeTransferId on the Payment row.
 *   2. Via source_transaction (charge ID) → PaymentIntent → stripePaymentIntentId —
 *      one extra API call; used when transfer.created fires before checkout.session.completed.
 *   3. Not found → log warning and return.  The transfer.created handler is best-effort;
 *      checkout.session.completed is the authoritative PAID signal.
 */
async function handleTransferCreated(
  stripe:   ReturnType<typeof getStripeClient>,
  transfer: Stripe.Transfer,
): Promise<void> {
  // Attempt 1: direct lookup via stripeTransferId (already set by checkout.session.completed)
  let payment = await prisma.payment.findFirst({
    where:  { stripeTransferId: transfer.id },
    select: { id: true, transferStatus: true },
  });

  // Attempt 2: resolve via source_transaction (charge) → PaymentIntent
  if (!payment && typeof transfer.source_transaction === "string") {
    try {
      const charge = await stripe.charges.retrieve(transfer.source_transaction);
      if (typeof charge.payment_intent === "string") {
        payment = await prisma.payment.findFirst({
          where:  { stripePaymentIntentId: charge.payment_intent },
          select: { id: true, transferStatus: true },
        });
      }
    } catch (err) {
      console.warn(
        `[handleTransferCreated] could not retrieve charge ${transfer.source_transaction}:`,
        err,
      );
    }
  }

  if (!payment) {
    console.log(
      `[handleTransferCreated] no Payment found for transfer=${transfer.id} — ignored` +
      ` (may arrive before checkout.session.completed; that handler will set stripeTransferId)`,
    );
    return;
  }

  if (payment.transferStatus === "paid") {
    console.log(
      `[handleTransferCreated] payment=${payment.id} transferStatus already "paid" — skip`,
    );
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data:  {
      transferStatus:   "paid",
      // Idempotent: stripeTransferId may already be set by checkout.session.completed.
      // Setting it here ensures it's always populated regardless of event order.
      stripeTransferId: transfer.id,
    },
  });

  console.log(
    `[handleTransferCreated] ✓ payment=${payment.id} → transferStatus=paid` +
    ` transfer=${transfer.id}`,
  );
}

/**
 * transfer.reversed  (Phase D)
 *
 * A Stripe Transfer was reversed.  Flag Payment.transferStatus = "reversed".
 * Full refund/chargeback accounting is Phase E — this is a minimal safety flag only.
 */
async function handleTransferReversed(transfer: Stripe.Transfer): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where:  { stripeTransferId: transfer.id },
    select: { id: true, transferStatus: true },
  });

  if (!payment) {
    console.log(
      `[handleTransferReversed] no Payment found for transfer=${transfer.id} — ignored`,
    );
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data:  { transferStatus: "reversed" },
  });

  console.log(
    `[handleTransferReversed] ✓ payment=${payment.id} → transferStatus=reversed` +
    ` transfer=${transfer.id}`,
  );
}

// ── Helper: email broker on Stripe payment received (never throws) ────────────
// Mirrors the pattern in /api/payments/webhook (Rapyd) exactly.
// Deferred via after() by the caller — runs after 200 is returned to Stripe.
// Skipped silently when broker has no email.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendBrokerPaidEmail(
  contractId: string,
  paymentId:  string,
  paidAt:     Date,
): Promise<void> {
  try {
    const contract = await prisma.contract.findUnique({
      where:   { id: contractId },
      include: { client: true, user: true, payment: true },
    });

    if (!contract) {
      console.warn(`[sendBrokerPaidEmail] contract ${contractId} not found — email skipped`);
      return;
    }

    const brokerEmail = contract.user.email?.trim() ?? "";
    if (!brokerEmail) {
      console.log(`[sendBrokerPaidEmail] broker for contract ${contractId} has no email — skipped`);
      return;
    }

    // grossAmount and commission are both stored in agorot; divide by 100 for NIS.
    const amountAgorot = contract.payment?.grossAmount ?? contract.commission;
    const amountNis    = Math.round(amountAgorot / 100);

    const baseUrl      = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const dashboardUrl = `${baseUrl}/contracts/${contractId}`;

    const receivedAtFormatted = paidAt.toLocaleDateString("he-IL", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const template = paymentReceivedEmail({
      brokerName:      contract.user.fullName,
      clientName:      contract.client.name,
      propertyAddress: parsePropertyAddress(contract.propertyAddress).address,
      amountNis,
      contractId,
      receivedAt:      receivedAtFormatted,
      dashboardUrl,
    });

    // Create PENDING record before network call so a crash mid-flight
    // still leaves an auditable record.
    const message = await prisma.message.create({
      data: {
        type:           "BROKER_PAYMENT_RECEIVED",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        contractId,
        clientId:       contract.clientId,
        paymentId,
        userId:         contract.userId,
        recipientEmail: brokerEmail,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({
      to:        brokerEmail,
      ...template,
      emailType: "payment_received",
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
        `[sendBrokerPaidEmail] email failed for contract ${contractId}: ${result.reason}`,
      );
    } else {
      console.log(
        `[sendBrokerPaidEmail] sent to broker — messageId=${result.messageId ?? "n/a"}` +
        ` contractId=${contractId}`,
      );
    }
  } catch (err) {
    // Must never propagate — payment is already recorded as PAID.
    console.error("[sendBrokerPaidEmail] unexpected error:", err);
  }
}

/**
 * payment_intent.payment_failed
 *
 * A card attempt inside a Checkout Session was declined.  For Checkout Sessions
 * the session remains open (user can retry with another card), so this event does
 * NOT permanently fail the session.  We mark Payment = FAILED per spec;
 * if the user later pays successfully, checkout.session.completed will re-update
 * the row to PAID.
 *
 * Lookup order:
 *   1. By stripePaymentIntentId — works if a previous attempt already linked the PI.
 *   2. Via stripe.checkout.sessions.list({ payment_intent }) — finds the session
 *      that owns this PI, then looks up by stripeCheckoutSessionId.
 */
async function handlePaymentIntentFailed(
  stripe: ReturnType<typeof getStripeClient>,
  pi:     Stripe.PaymentIntent,
): Promise<void> {
  // Attempt 1: direct lookup via stripePaymentIntentId
  let payment = await prisma.payment.findFirst({
    where:  { stripePaymentIntentId: pi.id },
    select: { id: true, status: true },
  });

  // Attempt 2: find via checkout session list
  if (!payment) {
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: pi.id,
        limit:          1,
      });
      const linkedSession = sessions.data[0];
      if (linkedSession) {
        payment = await prisma.payment.findFirst({
          where:  { stripeCheckoutSessionId: linkedSession.id },
          select: { id: true, status: true },
        });
      }
    } catch (err) {
      console.warn(
        `[handlePaymentIntentFailed] could not list sessions for PI ${pi.id}:`,
        err,
      );
    }
  }

  if (!payment) {
    console.log(
      `[handlePaymentIntentFailed] no Payment found for PI=${pi.id} — ignored`,
    );
    return;
  }

  if (payment.status !== "PENDING") {
    console.log(
      `[handlePaymentIntentFailed] payment ${payment.id} is ${payment.status} — skip`,
    );
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data:  { status: "FAILED", stripePaymentIntentId: pi.id },
  });

  console.log(
    `[handlePaymentIntentFailed] payment=${payment.id} → FAILED piId=${pi.id}`,
  );
}
