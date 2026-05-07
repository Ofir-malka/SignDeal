import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider, WebhookSignatureError } from "@/lib/payments";
import { sendNotification } from "@/lib/messaging/notify";

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
 * TODO (Phase 2 hardening):
 *  - Enforce HMAC signature verification (currently logs mismatch, does not reject)
 *  - Dead-letter queue / retry for DB failures
 *  - Broker notification SMS/email on PAID
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  // ── Step 0: log receipt so we know the webhook is arriving ───────────────────
  console.log("[PAYMENT WEBHOOK] ▶ received", {
    contentType:   headers["content-type"],
    hasSalt:       !!headers["salt"],
    hasSignature:  !!headers["signature"],
    hasTimestamp:  !!headers["timestamp"],
    bodyLength:    rawBody.length,
    bodyPreview:   rawBody.slice(0, 300),
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
    const provider = getPaymentProvider();
    const enrichedHeaders = {
      ...headers,
      "x-rapyd-raw-body":  rawBody,
      "x-rapyd-url-path":  "/api/payments/webhook",
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
    if (!contract.user.phone) {
      console.warn(`[notifyBrokerPaid] broker ${contract.userId} has no phone — skipping SMS`);
      return;
    }

    const commissionShekels = (contract.commission / 100).toLocaleString("he-IL");
    const body =
      `SignDeal — התשלום התקבל! ✓\n` +
      `עמלה של ₪${commissionShekels} עבור ${contract.client.name} (${contract.propertyAddress})\n` +
      `היכנס למערכת לפרטים.`;

    const notifyResult = await sendNotification({
      type:           "BROKER_PAYMENT_RECEIVED",
      channel:        "SMS",
      body,
      recipientPhone: contract.user.phone,
      userId:         contract.userId,
      contractId:     contract.id,
      clientId:       contract.clientId,
      paymentId,
    });

    console.log("[notifyBrokerPaid] result:", {
      ok:        notifyResult.ok,
      skipped:   notifyResult.skipped,
      messageId: notifyResult.messageId,
      reason:    notifyResult.reason,
    });
  } catch (err) {
    // Must never propagate — webhook already responded
    console.error("[notifyBrokerPaid] unexpected error:", err);
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
