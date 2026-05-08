import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { requireUserId } from "@/lib/require-user";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await params;

    // ── Rate limit: max 3 payment SMS per contract per hour ───────────────────
    const rl = rateLimit(id, "sms-payment", { max: 3, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי בקשות תשלום — המתן שעה ונסה שוב" },
        {
          status:  429,
          headers: { "Retry-After": String(rl.retryAfter) },
        },
      );
    }

    // ── 1. Load contract, client, payment ─────────────────────────────────────
    const contract = await prisma.contract.findFirst({
      where:   { id, userId },
      include: { client: true, payment: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
    }

    if (!contract.payment) {
      return NextResponse.json(
        { error: "לא קיימת בקשת תשלום לחוזה זה" },
        { status: 400 },
      );
    }

    if (!contract.payment.paymentUrl) {
      return NextResponse.json(
        { error: "קישור התשלום עדיין אינו זמין — נסה שוב בעוד מספר שניות" },
        { status: 400 },
      );
    }

    // ── 2. Build SMS body ──────────────────────────────────────────────────────
    const { client, payment } = contract;
    const normalizedPhone = normalizeIsraeliPhone(client.phone);

    const body =
      `שלום ${client.name},\n` +
      `לתשלום עמלת התיווך עבור הנכס ${contract.propertyAddress}:\n` +
      `${payment.paymentUrl}\n\n` +
      `SignDeal`;

    // ── 3. SMS_TEST_PHONE guard ────────────────────────────────────────────────
    const testPhone      = process.env.SMS_TEST_PHONE?.trim() || "";
    const normalizedTest = testPhone ? normalizeIsraeliPhone(testPhone) : "";

    if (normalizedTest && normalizedPhone !== normalizedTest) {
      console.log(
        `[sendPaymentSms] skipped — ${normalizedPhone} is not SMS_TEST_PHONE`,
      );
      const message = await prisma.message.create({
        data: {
          type:           "PAYMENT_REQUEST_LINK",
          channel:        "SMS",
          provider:       "infobip",
          body,
          contractId:     contract.id,
          clientId:       client.id,
          paymentId:      payment.id,
          userId:         contract.userId,
          recipientPhone: normalizedPhone,
          status:         "CANCELED",
          failureReason:  "skipped: phone does not match SMS_TEST_PHONE",
          attempts:       0,
        },
      });
      return NextResponse.json(
        { success: false, reason: "skipped: not test phone", message },
        { status: 200 }
      );
    }

    // ── 4. Create PENDING record before network call ───────────────────────────
    const message = await prisma.message.create({
      data: {
        type:           "PAYMENT_REQUEST_LINK",
        channel:        "SMS",
        provider:       "infobip",
        body,
        contractId:     contract.id,
        clientId:       client.id,
        paymentId:      payment.id,
        userId:         contract.userId,
        recipientPhone: normalizedPhone,
        status:         "PENDING",
        attempts:       0,
      },
    });

    // ── 5. Send & update record ───────────────────────────────────────────────
    const smsResult = await sendSms({ to: normalizedPhone, body });

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: smsResult.ok
        ? { status: "SENT",   providerMessageId: smsResult.messageId, attempts: 1, lastAttemptAt: new Date() }
        : { status: "FAILED", failureReason:      smsResult.reason,   attempts: 1, lastAttemptAt: new Date() },
    });

    if (!smsResult.ok) {
      console.error(
        `[sendPaymentSms] SMS failed for contract ${contract.id}:`,
        smsResult.reason,
      );
    }

    return NextResponse.json(
      smsResult.ok
        ? { success: true,  message: updated }
        : { success: false, reason: smsResult.reason, message: updated },
      { status: 200 }
    );

  } catch (error) {
    console.error("[POST /api/contracts/[id]/payment-request/send-sms]", error);
    return NextResponse.json({ error: "שגיאה בשליחת ה-SMS — נסה שוב" }, { status: 500 });
  }
}
