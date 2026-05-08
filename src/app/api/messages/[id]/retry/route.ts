/**
 * POST /api/messages/[id]/retry
 *
 * Retries a FAILED message record. Auth required — broker must own the message.
 *
 * Rules:
 *  - Status must be FAILED (not SENT, CANCELED, PENDING, DELIVERED).
 *  - Only client-facing message types can be retried (not broker-alert types,
 *    which are fire-and-forget notifications to the broker themselves).
 *  - WhatsApp manual records (provider="wa.me/manual") are not retried via this
 *    endpoint — the broker should re-open the ReminderModal instead.
 *  - Rate limit: 3 retries per message per hour to prevent spam.
 *
 * On success: updates the existing Message record in-place (increments attempts,
 * updates status, sets lastAttemptAt). The original FAILED record is preserved
 * in the status history via the updatedAt field.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { sendSms } from "@/lib/messaging/sms-provider";
import { rateLimit } from "@/lib/rate-limit";

// Message types the broker may retry on behalf of a client
const RETRYABLE_TYPES = new Set([
  "CONTRACT_SIGNING_LINK",
  "SIGNING_REMINDER",
  "PAYMENT_REQUEST_LINK",
  "PAYMENT_REMINDER",
]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireUserId();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    // ── Rate limit: 3 retries per message per hour ────────────────────────────
    const rl = rateLimit(`msg:${id}`, "message-retry", { max: 3, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות חוזרים — המתן שעה ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Load message, verify ownership ───────────────────────────────────────
    const message = await prisma.message.findUnique({ where: { id } });

    if (!message || message.userId !== userId) {
      return NextResponse.json({ error: "ההודעה לא נמצאה" }, { status: 404 });
    }

    if (message.status !== "FAILED") {
      return NextResponse.json(
        { error: `לא ניתן לשלוח מחדש הודעה בסטטוס: ${message.status}` },
        { status: 409 },
      );
    }

    if (!RETRYABLE_TYPES.has(message.type)) {
      return NextResponse.json(
        { error: "סוג הודעה זה אינו ניתן לשליחה חוזרת" },
        { status: 400 },
      );
    }

    // WhatsApp manual records are not retried here — use the reminder modal
    if (message.provider === "wa.me/manual") {
      return NextResponse.json(
        { error: "הודעות WhatsApp ידניות אינן ניתנות לשליחה חוזרת אוטומטית — פתח את תיבת הדו-שיח מחדש" },
        { status: 400 },
      );
    }

    // ── Currently only SMS retry is implemented ───────────────────────────────
    // EMAIL retry can be wired when sendEmail is stable; WHATSAPP when WA API is live.
    if (message.channel !== "SMS" || !message.recipientPhone) {
      return NextResponse.json(
        { error: "שליחה חוזרת זמינה כרגע רק עבור הודעות SMS" },
        { status: 400 },
      );
    }

    // ── Re-send via Infobip ───────────────────────────────────────────────────
    const smsResult = await sendSms({ to: message.recipientPhone, body: message.body });

    // Update message in-place: preserve the row, increment attempts
    const updated = await prisma.message.update({
      where: { id },
      data: smsResult.ok
        ? {
            status:            "SENT",
            providerMessageId: smsResult.messageId,
            failureReason:     null,
            attempts:          { increment: 1 },
            lastAttemptAt:     new Date(),
          }
        : {
            status:        "FAILED",
            failureReason: smsResult.reason,
            attempts:      { increment: 1 },
            lastAttemptAt: new Date(),
          },
    });

    if (!smsResult.ok) {
      console.error(`[retry] message ${id} retry failed:`, smsResult.reason);
      return NextResponse.json(
        {
          success: false,
          error:   "שליחת ה-SMS נכשלה שוב — בדוק את מספר הטלפון ונסה שוב מאוחר יותר",
          status:  updated.status,
          attempts: updated.attempts,
        },
        { status: 502 },
      );
    }

    // ── Optionally log activity on the linked contract ────────────────────────
    if (message.contractId) {
      await prisma.activity.create({
        data: {
          contractId: message.contractId,
          message:    `נשלחה מחדש הודעת SMS (ניסיון #${updated.attempts})`,
          userId,
        },
      }).catch((err) => console.error("[retry] activity create failed:", err));
    }

    return NextResponse.json({
      success:   true,
      messageId: updated.id,
      attempts:  updated.attempts,
      status:    updated.status,
    });
  } catch (error) {
    console.error("[POST /api/messages/[id]/retry]", error);
    return NextResponse.json({ error: "שגיאה בשליחה חוזרת — נסה שוב" }, { status: 500 });
  }
}
