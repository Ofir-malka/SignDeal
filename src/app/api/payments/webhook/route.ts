import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "@/lib/payments";

/**
 * POST /api/payments/webhook
 *
 * Accepts payment-provider callbacks and advances contracts to PAID (or FAILED).
 *
 * TODO (Phase 2 hardening):
 *  - Real HMAC signature verification per provider
 *  - Idempotency check (ignore duplicate events for the same providerPaymentId)
 *  - Dead-letter queue / retry for DB failures
 *  - Broker notification SMS/email on PAID
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  console.log("[PAYMENT WEBHOOK] received", { headers, rawBody: rawBody.slice(0, 500) });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[PAYMENT WEBHOOK] non-JSON body — ignoring");
    // Providers occasionally send form-encoded pings; acknowledge and move on.
    return NextResponse.json({ received: true });
  }

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
    const result   = await provider.verifyWebhook(payload, enrichedHeaders);

    console.log("[PAYMENT WEBHOOK] parsed result:", result);

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
    //      in payload.data.metadata.contract_id, payload.data.contract_id,
    //      payload.metadata.contract_id, or the top-level payload.contractId.

    const data = (payload["data"] as Record<string, unknown>) ?? {};
    const meta = (
      (data["metadata"] as Record<string, unknown>) ??
      (payload["metadata"] as Record<string, unknown>) ??
      {}
    );

    let payment =
      // 1. match by stored providerPaymentId
      await prisma.payment.findFirst({
        where: { providerPaymentId: result.providerPaymentId },
      }) ??
      // 2. match by Payment primary key (Rapyd: merchant_reference_id = our Payment.id)
      await prisma.payment.findUnique({
        where: { id: result.providerPaymentId },
      });

    if (!payment) {
      // 3. fallback: extract contractId from nested metadata fields
      const contractId =
        typeof meta["contract_id"]    === "string" ? meta["contract_id"]    :
        typeof data["contract_id"]    === "string" ? data["contract_id"]    :
        typeof payload["contractId"]  === "string" ? payload["contractId"]  :
        null;

      if (contractId) {
        console.log("[PAYMENT WEBHOOK] payment not found by ID — falling back to contractId:", contractId);
        await processPaymentUpdate(contractId, result.providerPaymentId, result.status, result.paidAt);
      } else {
        console.warn(
          "[PAYMENT WEBHOOK] no matching payment found.",
          { providerPaymentId: result.providerPaymentId },
        );
      }
      return NextResponse.json({ received: true });
    }

    await processPaymentUpdate(payment.contractId, result.providerPaymentId, result.status, result.paidAt);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[POST /api/payments/webhook]", error);
    // Always return 200 to prevent provider retries for our own DB errors.
    return NextResponse.json({ received: true, error: "Internal processing error" });
  }
}

// ── Helper: persist status change + advance contract ─────────────────────────

async function processPaymentUpdate(
  contractId:        string,
  providerPaymentId: string,
  status:            "PAID" | "FAILED" | "CANCELED",
  paidAt?:           Date,
): Promise<void> {
  const paymentStatus  = status;                              // PAID | FAILED | CANCELED
  const contractStatus = status === "PAID" ? "PAID" : null;  // only PAID advances the contract

  await prisma.payment.updateMany({
    where: { contractId },
    data:  {
      status:            paymentStatus,
      providerPaymentId,
      ...(status === "PAID" ? { paidAt: paidAt ?? new Date() } : {}),
    },
  });

  if (contractStatus) {
    await prisma.contract.updateMany({
      where: { id: contractId, status: { in: ["PAYMENT_PENDING", "SIGNED", "OPENED"] } },
      data:  { status: contractStatus },
    });

    console.log(`[PAYMENT WEBHOOK] contract ${contractId} advanced to ${contractStatus}`);
  }
}
