/**
 * POST /api/contracts/[id]/send-reminder
 *
 * Sends a signing-reminder to the client for a contract that is in
 * SENT or OPENED status (i.e. awaiting client signature).
 *
 * Body (optional):
 *   channel: "SMS" | "WHATSAPP"   — default "SMS"
 *
 * For SMS:   sends via Infobip; persists Message + Activity records.
 * For WHATSAPP: creates a SENT Message record (provider="wa.me/manual")
 *               so the action is auditable; the client opens wa.me themselves.
 *               No actual Infobip/WA Business API call is made — this is the
 *               WhatsApp-ready stub until a WA Business API provider is wired.
 *
 * Auth required — broker only.
 * Rate limit: 5 reminders per contract per 10 minutes (shared across channels).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { sendNotification } from "@/lib/messaging/notify";
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireUserId();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    // ── Rate limit: 5 reminders per contract per 10 minutes (all channels) ───
    const rl = rateLimit(id, "sms-reminder", { max: 5, windowMs: 10 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי תזכורות — המתן מספר דקות ונסה שוב" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ── Parse body — channel defaults to SMS ─────────────────────────────────
    let channel: "SMS" | "WHATSAPP" = "SMS";
    try {
      const body = await request.json();
      if (body?.channel === "WHATSAPP") channel = "WHATSAPP";
    } catch {
      // no body or invalid JSON — stay with SMS default
    }

    const contract = await prisma.contract.findFirst({
      where:  { id, userId },
      select: {
        id:             true,
        status:         true,
        signatureToken: true,
        propertyAddress: true,
        userId:         true,
        client: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "החוזה לא נמצא" }, { status: 404 });
    }

    // Only meaningful for contracts still awaiting signature
    if (!["SENT", "OPENED"].includes(contract.status)) {
      return NextResponse.json(
        { error: "תזכורות ניתן לשלוח רק לחוזים הממתינים לחתימה" },
        { status: 400 },
      );
    }

    if (!contract.signatureToken) {
      return NextResponse.json({ error: "לחוזה אין קישור חתימה" }, { status: 400 });
    }

    const baseUrl     = process.env.APP_BASE_URL?.trim() || "https://www.signdeal.co.il";
    const signingLink = `${baseUrl}/contracts/sign/${contract.signatureToken}`;

    const smsBody =
      `שלום ${contract.client.name},\n` +
      `תזכורת: עדיין לא חתמת על ההסכם שנשלח אליך.\n` +
      `לחתימה דיגיטלית:\n${signingLink}\n\n` +
      `SignDeal`;

    // ── WHATSAPP channel — log intent as an auditable record, no API send ────
    // When WhatsApp Business API is wired, replace this block with a
    // sendNotification({ channel: "WHATSAPP", ... }) call using the WA provider.
    if (channel === "WHATSAPP") {
      const normalizedPhone = normalizeIsraeliPhone(contract.client.phone);
      const message = await prisma.message.create({
        data: {
          type:           "SIGNING_REMINDER",
          channel:        "WHATSAPP",
          provider:       "wa.me/manual",
          body:           smsBody,
          contractId:     contract.id,
          clientId:       contract.client.id,
          userId,
          recipientPhone: normalizedPhone,
          // Status SENT because the broker manually sent it via wa.me;
          // we record their intent, not a provider confirmation.
          status:   "SENT",
          attempts: 1,
          lastAttemptAt: new Date(),
        },
      });

      await prisma.activity.create({
        data: {
          contractId: contract.id,
          message:    `נשלחה תזכורת חתימה ב-WhatsApp ללקוח ${contract.client.name}`,
          userId,
        },
      });

      return NextResponse.json({ success: true, channel: "WHATSAPP", messageId: message.id });
    }

    // ── SMS channel — send via Infobip, persist Message + Activity ───────────
    const result = await sendNotification({
      type:           "SIGNING_REMINDER",
      channel:        "SMS",
      body:           smsBody,
      recipientPhone: contract.client.phone,
      userId:         contract.userId,
      contractId:     contract.id,
      clientId:       contract.client.id,
    });

    // Persist Activity regardless of SMS outcome (skipped counts as attempted)
    const activityMsg = result.ok
      ? `נשלחה תזכורת חתימה ב-SMS ללקוח ${contract.client.name}`
      : result.skipped
        ? `תזכורת חתימה ב-SMS — נחסמה על ידי SMS_TEST_PHONE (לא בסביבת ייצור)`
        : `שליחת תזכורת חתימה ב-SMS נכשלה: ${result.reason ?? "שגיאה לא ידועה"}`;

    await prisma.activity.create({
      data: { contractId: contract.id, message: activityMsg, userId },
    }).catch((err) => console.error("[send-reminder] failed to create activity:", err));

    if (result.skipped) {
      return NextResponse.json({ success: true, skipped: true, messageId: result.messageId });
    }

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "שגיאה בשליחת התזכורת — נסה שוב מאוחר יותר", reason: result.reason },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, channel: "SMS", messageId: result.messageId });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/send-reminder]", error);
    return NextResponse.json({ error: "שגיאה בשליחת התזכורת" }, { status: 500 });
  }
}
