import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { calculateFees, defaultFeeConfig } from "@/lib/payments/fee-calculator";
import { getPaymentProvider } from "@/lib/payments";
import { sendSms } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, paymentRequestEmail } from "@/lib/email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await params;

    // Fetch broker early — needed for notification copy.
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { fullName: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── Rate limit: double-keyed to prevent both per-contract and per-broker flooding
    // 5 requests per contract per hour — enough for retries after provider errors.
    // 15 per broker per hour across all contracts — blocks bulk automation.
    // Both limits call Rapyd (external) and send SMS; conservative caps are correct.
    const rlContract = rateLimit(id,     "payment-request",    { max: 5,  windowMs: 60 * 60_000 });
    const rlBroker   = rateLimit(userId, "payment-request-all", { max: 15, windowMs: 60 * 60_000 });
    if (!rlContract.allowed || !rlBroker.allowed) {
      const retryAfter = Math.max(rlContract.retryAfter ?? 0, rlBroker.retryAfter ?? 0);
      return NextResponse.json(
        { error: "יותר מדי בקשות תשלום — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const contract = await prisma.contract.findFirst({
      where:  { id, userId },
      select: {
        id:              true,
        status:          true,
        commission:      true,
        propertyAddress: true,
        propertyCity:    true,
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
        payment:         true,   // needed for the PAID early-return
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // ── Guard: do not reset a payment that has already been collected ─────────
    // Re-creating a payment request on a PAID contract would wipe providerPaymentId,
    // paidAt, and paymentUrl — corrupting the audit trail.
    if (contract.status === "PAID") {
      return NextResponse.json(
        { error: "Contract is already paid", payment: contract.payment },
        { status: 409 },
      );
    }

    // ── Step 1: calculate fee breakdown ──────────────────────────────────────
    const config = defaultFeeConfig();
    const fees   = calculateFees(contract.commission, config);

    const providerName = process.env.PAYMENT_PROVIDER?.trim() ?? "stub";

    // ── Step 2: persist fee breakdown (creates or resets existing to PENDING) ─
    const payment = await prisma.payment.upsert({
      where:  { contractId: id },
      create: {
        contractId:         id,
        status:             "PENDING",
        provider:           providerName,
        amount:             fees.amount,
        processorFee:       fees.processorFee,
        platformFee:        fees.platformFee,
        grossAmount:        fees.grossAmount,
        netAmount:          fees.netAmount,
        feePaidBy:          fees.feePaidBy,
        providerFeePercent: fees.providerFeePercent,
        platformFeePercent: fees.platformFeePercent,
      },
      update: {
        status:            "PENDING",
        provider:          providerName,
        paidAt:            null,
        paymentUrl:        null,   // clear stale URL on retry
        providerPaymentId: null,   // clear stale ID on retry
        amount:             fees.amount,
        processorFee:       fees.processorFee,
        platformFee:        fees.platformFee,
        grossAmount:        fees.grossAmount,
        netAmount:          fees.netAmount,
        feePaidBy:          fees.feePaidBy,
        providerFeePercent: fees.providerFeePercent,
        platformFeePercent: fees.platformFeePercent,
      },
    });

    // ── Step 3: call provider to generate a hosted payment link ──────────────
    const provider   = getPaymentProvider();
    const linkResult = await provider.createPaymentLink({
      contractId:  id,
      paymentId:   payment.id,
      amount:      fees.grossAmount,   // total charged to customer
      clientName:  contract.client.name,
      clientPhone: contract.client.phone,
      clientEmail: contract.client.email || undefined,
      description: `עמלת תיווך — ${contract.propertyAddress}, ${contract.propertyCity}`,
    });

    if (!linkResult.ok) {
      console.error("[POST /api/contracts/[id]/payment-request] provider error:", linkResult.reason);
      return NextResponse.json(
        { error: "Payment provider failed to create link", reason: linkResult.reason },
        { status: 502 },
      );
    }

    // ── Step 4: persist paymentUrl + providerPaymentId returned by provider ──
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data:  {
        paymentUrl:        linkResult.paymentUrl,
        providerPaymentId: linkResult.providerPaymentId,
      },
    });

    // ── Step 5: advance contract lifecycle to PAYMENT_PENDING ─────────────────
    // Only moves forward from SIGNED; already-PAYMENT_PENDING contracts stay put.
    await prisma.contract.updateMany({
      where: { id, status: { in: ["SIGNED", "OPENED"] } },
      data:  { status: "PAYMENT_PENDING" },
    });

    // ── Step 6: auto-send payment link via SMS ────────────────────────────────
    // Errors are swallowed — SMS failure must never fail the payment request.
    const notifyContract = {
      id:              contract.id,
      userId,
      clientId:        contract.client.id,
      propertyAddress: contract.propertyAddress,
      client:          contract.client,
    };
    const notifyPayment = { id: updated.id, paymentUrl: updated.paymentUrl };

    await sendPaymentLinkSms(notifyContract, notifyPayment, user.fullName);

    // Email is sent after the response is flushed; after() keeps Vercel alive.
    // sendPaymentLinkEmail catches all errors internally.
    after(async () => {
      await sendPaymentLinkEmail(
        notifyContract,
        notifyPayment,
        user.fullName,
        fees.grossAmount,
      );
    });

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/payment-request]", error);
    return NextResponse.json({ error: "Failed to create payment request" }, { status: 500 });
  }
}

// ── Helper: auto-send payment link SMS (never throws) ────────────────────────
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendPaymentLinkSms(
  contract: {
    id:              string;
    userId:          string;
    clientId:        string;
    propertyAddress: string;
    client:          { name: string; phone: string };
  },
  payment:    { id: string; paymentUrl: string | null },
  brokerName: string,
): Promise<void> {
  try {
    if (!payment.paymentUrl) return;

    const normalizedPhone = normalizeIsraeliPhone(contract.client.phone);

    const body =
      `שלום ${contract.client.name},\n` +
      `נשלחה אליך בקשת תשלום מ-${brokerName} עבור:\n` +
      `${contract.propertyAddress}\n\n` +
      `לתשלום מאובטח:\n` +
      `${payment.paymentUrl}\n\n` +
      `SignDeal`;

    // SMS_TEST_PHONE guard — in non-production envs, only send to the test number
    const testPhone      = process.env.SMS_TEST_PHONE?.trim() ?? "";
    const normalizedTest = testPhone ? normalizeIsraeliPhone(testPhone) : "";

    if (normalizedTest && normalizedPhone !== normalizedTest) {
      console.log(`[sendPaymentLinkSms] skipped — ${normalizedPhone} is not SMS_TEST_PHONE`);
      await prisma.message.create({
        data: {
          type:           "PAYMENT_REQUEST_LINK",
          channel:        "SMS",
          provider:       "infobip",
          body,
          contractId:     contract.id,
          clientId:       contract.clientId,
          paymentId:      payment.id,
          userId:         contract.userId,
          recipientPhone: normalizedPhone,
          status:         "CANCELED",
          failureReason:  "skipped: phone does not match SMS_TEST_PHONE",
          attempts:       0,
        },
      });
      return;
    }

    const message = await prisma.message.create({
      data: {
        type:           "PAYMENT_REQUEST_LINK",
        channel:        "SMS",
        provider:       "infobip",
        body,
        contractId:     contract.id,
        clientId:       contract.clientId,
        paymentId:      payment.id,
        userId:         contract.userId,
        recipientPhone: normalizedPhone,
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendSms({ to: normalizedPhone, body });

    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? { status: "SENT",   providerMessageId: result.messageId, attempts: 1, lastAttemptAt: new Date() }
        : { status: "FAILED", failureReason: result.reason,        attempts: 1, lastAttemptAt: new Date() },
    });

    if (!result.ok) {
      console.error(`[sendPaymentLinkSms] SMS failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    console.error("[sendPaymentLinkSms] unexpected error:", err);
  }
}

// ── Helper: auto-send payment link email (never throws) ──────────────────────
// Skipped silently when client has no email address.
// TODO(queue): Replace with a durable job queue once retry-on-failure is needed.

async function sendPaymentLinkEmail(
  contract: {
    id:              string;
    userId:          string;
    clientId:        string;
    propertyAddress: string;
    client:          { name: string; email: string };
  },
  payment:    { id: string; paymentUrl: string | null },
  brokerName: string,
  amountNis:  number,
): Promise<void> {
  try {
    if (!payment.paymentUrl) return;
    if (!contract.client.email.trim()) {
      console.log(`[sendPaymentLinkEmail] skipped — contract ${contract.id} has no client email`);
      return;
    }

    const template = paymentRequestEmail({
      clientName:      contract.client.name,
      brokerName,
      propertyAddress: contract.propertyAddress,
      amountNis,
      paymentLink:     payment.paymentUrl,
    });

    // Create PENDING record before the network call.
    const message = await prisma.message.create({
      data: {
        type:           "PAYMENT_REQUEST_LINK",
        channel:        "EMAIL",
        provider:       "resend",
        subject:        template.subject,
        body:           template.text,
        contractId:     contract.id,
        clientId:       contract.clientId,
        paymentId:      payment.id,
        userId:         contract.userId,
        recipientEmail: contract.client.email.trim(),
        status:         "PENDING",
        attempts:       0,
      },
    });

    const result = await sendEmail({ to: contract.client.email.trim(), ...template });

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
      console.error(`[sendPaymentLinkEmail] email failed for contract ${contract.id}:`, result.reason);
    }
  } catch (err) {
    // Must never propagate — the payment request is already created.
    console.error("[sendPaymentLinkEmail] unexpected error:", err);
  }
}
