import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider, WebhookSignatureError } from "@/lib/payments";
import { sendNotification } from "@/lib/messaging/notify";
import { sendEmail, paymentReceivedEmail } from "@/lib/email";

/**
 * POST /api/payments/webhook
 *
 * Accepts Rapyd payment-provider callbacks and advances contracts to PAID (or FAILED).
 *
 * Webhook URL to configure in Rapyd dashboard:
 *   https://www.signdeal.co.il/api/payments/webhook
 *
 * Supported event types:
 *   PAYMENT_COMPLETED / PAYMENT_SUCCEEDED → Contract PAID
 *   PAYMENT_FAILED / PAYMENT_EXPIRED      → Payment FAILED (contract unchanged)
 *   PAYMENT_CANCELED                      → Payment CANCELED (contract unchanged)
 *
 * Idempotent: if Payment row is already PAID, returns 200 without re-processing.
 *
 * Security: HMAC signature verification is fully enforced in production via
 * RapydPaymentProvider.verifyWebhook(). Set RAPYD_SKIP_SIGNATURE_VERIFICATION=true
 * only in sandbox/staging Vercel environments — never in production.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  // ── Step 0: log receipt so we know the webhook is arriving ───────────────────
  // Log every header name (not values) so we can confirm Rapyd is sending
  // salt / timestamp / signature without leaking credentials in logs.
  console.log("[PAYMENT WEBHOOK] ▶ received", {
    contentType:    headers["content-type"],
    hasSalt:        !!headers["salt"],
    hasSignature:   !!headers["signature"],
    hasTimestamp:   !!headers["timestamp"],
    saltValue:      headers["salt"]      ? `${headers["salt"].slice(0, 6)}…` : "(missing)",
    timestampValue: headers["timestamp"] ? headers["timestamp"]               : "(missing)",
    sigPrefix:      headers["signature"] ? `${headers["signature"].slice(0, 8)}…` : "(missing)",
    allHeaderKeys:  Object.keys(headers).sort().join(", "),
    bodyLength:     rawBody.length,
    bodyPreview:    rawBody.slice(0, 300),
    skipSigEnvVar:  process.env.RAPYD_SKIP_SIGNATURE_VERIFICATION === "true" ? "SET" : "not set",
    webhookPath:    process.env.RAPYD_WEBHOOK_URL_PATH?.trim() || "/api/payments/webhook (default)",
  });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[PAYMENT WEBHOOK] non-JSON body — ignoring");
    // Providers occasionally send form-encoded pings; acknowledge and move on.
    return NextResponse.json({ received: true });
  }

  // Log the event type immediately so we can diagnose misconfigured event subscriptions
  const eventType = String(payload["type"] ?? "(none)");
  console.log("[PAYMENT WEBHOOK] event type:", eventType);

  try {
    // ── Step 1: parse + verify via provider abstraction ──────────────────────
    // Rapyd's verifyWebhook needs the exact raw body bytes (for HMAC) and the
    // webhook URL path (part of the signature base string).  We inject both as
    // synthetic headers so the provider can access them without coupling to the
    // Next.js Request object.
    //
    // RAPYD_WEBHOOK_URL_PATH must match the path registered in the Rapyd dashboard
    // (Settings → Webhooks).  The default "/api/payments/webhook" is correct for
    // https://www.signdeal.co.il/api/payments/webhook.  Override when your ngrok
    // or staging URL has a different path.
    const webhookUrlPath =
      process.env.RAPYD_WEBHOOK_URL_PATH?.trim() || "/api/payments/webhook";

    const provider = getPaymentProvider();
    const enrichedHeaders = {
      ...headers,
      "x-rapyd-raw-body":  rawBody,
      "x-rapyd-url-path":  webhookUrlPath,
    };
    const result = await provider.verifyWebhook(payload, enrichedHeaders);

    console.log("[PAYMENT WEBHOOK] parsed result:", {
      providerPaymentId: result.providerPaymentId,
      status:            result.status,
      paidAt:            result.paidAt,
      totalAmount:       result.totalAmount,
    });

    // ── Step 2: locate Payment record ─────────────────────────────────────────
    //
    // Lookup order — needed because Rapyd stores a checkout_ ID at creation time
    // but the PAYMENT_COMPLETED webhook sends our internal payment.id as
    // merchant_reference_id (which verifyWebhook surfaces as providerPaymentId):
    //
    //   1. providerPaymentId column  = result.providerPaymentId
    //      Works when the stored ID matches what the webhook sends (stub, some providers).
    //
    //   2. Payment.id               = result.providerPaymentId
    //      Rapyd case: merchant_reference_id is our own CUID, so result.providerPaymentId
    //      IS the Payment row's primary key.
    //
    //   3. contractId extracted from nested payload metadata
    //      Last-resort fallback for providers that embed the contract reference
    //      in payload.data.metadata.contract_id etc.

    const data = (payload["data"] as Record<string, unknown>) ?? {};
    const meta = (
      (data["metadata"] as Record<string, unknown>) ??
      (payload["metadata"] as Record<string, unknown>) ??
      {}
    );

    let lookupPath = "";
    const payment =
      // 1. match by stored providerPaymentId
      await (async () => {
        const p = await prisma.payment.findFirst({
          where: { providerPaymentId: result.providerPaymentId },
        });
        if (p) lookupPath = "providerPaymentId column";
        return p;
      })() ??
      // 2. match by Payment primary key (Rapyd: merchant_reference_id = our Payment.id)
      await (async () => {
        const p = await prisma.payment.findUnique({
          where: { id: result.providerPaymentId },
        });
        if (p) lookupPath = "Payment.id (merchant_reference_id)";
        return p;
      })();

    if (!payment) {
      // 3. fallback: extract contractId from nested metadata fields
      const contractId =
        typeof meta["contract_id"]    === "string" ? meta["contract_id"]    :
        typeof data["contract_id"]    === "string" ? data["contract_id"]    :
        typeof payload["contractId"]  === "string" ? payload["contractId"]  :
        null;

      console.warn("[PAYMENT WEBHOOK] payment row not found by ID:", {
        triedProviderPaymentId: result.providerPaymentId,
        fallbackContractId:     contractId,
      });

      if (contractId) {
        console.log("[PAYMENT WEBHOOK] falling back to contractId lookup:", contractId);
        await processPaymentUpdate(contractId, result.providerPaymentId, result.status, result.paidAt);
        if (result.status === "PAID") {
          const fallbackPayment = await prisma.payment.findFirst({ where: { contractId } });
          if (fallbackPayment) await notifyBrokerPaid(contractId, fallbackPayment.id);
        }
      } else {
        console.error(
          "[PAYMENT WEBHOOK] ✗ no matching payment — cannot advance contract.",
          {
            eventType,
            providerPaymentId: result.providerPaymentId,
            rawPayloadKeys:    Object.keys(payload),
            dataKeys:          Object.keys(data),
          },
        );
      }
      return NextResponse.json({ received: true });
    }

    console.log("[PAYMENT WEBHOOK] matched payment row:", {
      paymentId:    payment.id,
      contractId:   payment.contractId,
      currentStatus: payment.status,
      lookupPath,
    });

    // ── Step 3: idempotency — skip re-processing if already in terminal state ──
    if (payment.status === "PAID") {
      console.log(`[PAYMENT WEBHOOK] idempotent — payment ${payment.id} already PAID; skipping`);
      return NextResponse.json({ received: true });
    }

    // ── Step 4: persist + advance contract ────────────────────────────────────
    await processPaymentUpdate(payment.contractId, result.providerPaymentId, result.status, result.paidAt);

    // ── Step 5: notify broker when payment is confirmed ───────────────────────
    if (result.status === "PAID") {
      await notifyBrokerPaid(payment.contractId, payment.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // ── Signature failure → 401 ───────────────────────────────────────────────
    // Return non-200 so Rapyd knows the webhook was rejected, not processed.
    // Rapyd will NOT retry on 4xx (it retries on 5xx and timeouts only).
    if (error instanceof WebhookSignatureError) {
      console.error("[PAYMENT WEBHOOK] ✗ signature verification failed:", error.message);
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    // ── All other errors → 200 ────────────────────────────────────────────────
    // Return 200 to prevent Rapyd from retrying events that failed due to our
    // own DB errors (which would trigger duplicate processing on retry).
    console.error("[PAYMENT WEBHOOK] ✗ unhandled error:", error);
    return NextResponse.json({ received: true, error: "Internal processing error" });
  }
}

// ── Helper: broker paid notification ─────────────────────────────────────────
// Fires after a payment is confirmed PAID. Never throws — errors are swallowed
// so webhook always returns 200 to the provider.
// SMS is awaited (fast); email is deferred via after() so it never delays the 200.

async function notifyBrokerPaid(contractId: string, paymentId: string): Promise<void> {
  try {
    const contract = await prisma.contract.findUnique({
      where:   { id: contractId },
      include: { client: true, user: true, payment: true },
    });

    if (!contract) {
      console.warn(`[notifyBrokerPaid] contract ${contractId} not found`);
      return;
    }

    // Use grossAmount (what the client actually paid); fall back to commission if payment
    // row is unexpectedly absent (defensive — should never happen in PAID state).
    const amountNis       = contract.payment?.grossAmount ?? contract.commission;
    const amountFormatted = Math.round(amountNis).toLocaleString("he-IL");
    const paidAt          = contract.payment?.paidAt ?? new Date();

    // ── SMS to broker ─────────────────────────────────────────────────────────
    if (contract.user.phone) {
      const body =
        `התקבל תשלום עבור:\n` +
        `${contract.propertyAddress}\n\n` +
        `סכום:\n` +
        `₪${amountFormatted}\n\n` +
        `${contract.client.name} השלים/ה את התשלום בהצלחה.\n\n` +
        `SignDeal`;

      const smsResult = await sendNotification({
        type:           "BROKER_PAYMENT_RECEIVED",
        channel:        "SMS",
        body,
        recipientPhone: contract.user.phone,
        userId:         contract.userId,
        contractId:     contract.id,
        clientId:       contract.clientId,
        paymentId,
      });

      console.log("[notifyBrokerPaid] SMS result:", {
        ok:        smsResult.ok,
        skipped:   smsResult.skipped,
        messageId: smsResult.messageId,
        reason:    smsResult.reason,
      });
    } else {
      console.warn(`[notifyBrokerPaid] broker ${contract.userId} has no phone — SMS skipped`);
    }

    // ── Email to broker — deferred via after() ────────────────────────────────
    // Runs after the 200 is flushed to Rapyd; sendBrokerPaidEmail never throws.
    const emailCtx = {
      id:              contract.id,
      userId:          contract.userId,
      clientId:        contract.clientId,
      propertyAddress: contract.propertyAddress,
      brokerFullName:  contract.user.fullName,
      brokerEmail:     contract.user.email,
      clientName:      contract.client.name,
    };
    after(async () => {
      await sendBrokerPaidEmail(emailCtx, paymentId, amountNis, paidAt);
    });

  } catch (err) {
    // Must never propagate — webhook always returns 200
    console.error("[notifyBrokerPaid] unexpected error:", err);
  }
}

// ── Helper: email broker on payment received (never throws) ──────────────────
// Skipped silently when broker has no email address (shouldn't happen — email is
// required at registration — but defensive regardless).
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendBrokerPaidEmail(
  ctx: {
    id:              string;
    userId:          string;
    clientId:        string;
    propertyAddress: string;
    brokerFullName:  string;
    brokerEmail:     string;
    clientName:      string;
  },
  paymentId: string,
  amountNis: number,
  paidAt:    Date,
): Promise<void> {
  try {
    if (!ctx.brokerEmail.trim()) {
      console.log(`[sendBrokerPaidEmail] skipped — broker for contract ${ctx.id} has no email`);
      return;
    }

    const baseUrl      = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
    const dashboardUrl = `${baseUrl}/contracts/${ctx.id}`;

    const receivedAtFormatted = paidAt.toLocaleDateString("he-IL", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const template = paymentReceivedEmail({
      brokerName:      ctx.brokerFullName,
      clientName:      ctx.clientName,
      propertyAddress: ctx.propertyAddress,
      amountNis,
      contractId:      ctx.id,
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
        contractId:     ctx.id,
        clientId:       ctx.clientId,
        paymentId,
        userId:         ctx.userId,
        recipientEmail: ctx.brokerEmail.trim(),
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({ to: ctx.brokerEmail.trim(), ...template });

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
      console.error(`[sendBrokerPaidEmail] email failed for contract ${ctx.id}:`, result.reason);
    } else {
      console.log(`[sendBrokerPaidEmail] sent to ${ctx.brokerEmail} — messageId=${result.messageId ?? "n/a"}`);
    }
  } catch (err) {
    // Must never propagate — payment is already recorded as PAID.
    console.error("[sendBrokerPaidEmail] unexpected error:", err);
  }
}

// ── Helper: persist status change + advance contract ─────────────────────────

async function processPaymentUpdate(
  contractId:        string,
  providerPaymentId: string,
  status:            "PAID" | "FAILED" | "CANCELED",
  paidAt?:           Date,
): Promise<void> {
  const contractStatus = status === "PAID" ? "PAID" : null;  // only PAID advances the contract

  console.log("[PAYMENT WEBHOOK] processPaymentUpdate →", {
    contractId,
    providerPaymentId,
    status,
    paidAt,
    willAdvanceContract: !!contractStatus,
  });

  await prisma.payment.updateMany({
    where: { contractId },
    data:  {
      status:            status,
      providerPaymentId,
      ...(status === "PAID" ? { paidAt: paidAt ?? new Date() } : {}),
    },
  });

  if (contractStatus) {
    const updated = await prisma.contract.updateMany({
      where: { id: contractId, status: { in: ["PAYMENT_PENDING", "SIGNED", "OPENED"] } },
      data:  { status: contractStatus },
    });

    if (updated.count > 0) {
      console.log(`[PAYMENT WEBHOOK] ✓ contract ${contractId} → ${contractStatus}`);
    } else {
      // Contract may already be PAID (idempotent), or may be in an unexpected state
      const contract = await prisma.contract.findUnique({
        where:  { id: contractId },
        select: { status: true },
      });
      console.warn(`[PAYMENT WEBHOOK] contract ${contractId} not updated (0 rows). Current status:`, contract?.status);
    }
  } else {
    console.log(`[PAYMENT WEBHOOK] payment ${status} — contract not advanced (only PAID triggers advance)`);
  }
}
