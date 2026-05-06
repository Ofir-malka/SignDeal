import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/messaging/sms-provider";

/**
 * POST /api/messages/send-sms-test
 *
 * Developer-only route: sends a test SMS and records the full lifecycle
 * in the Message table.
 *
 * Body: { to: string, body: string }
 *   to   — recipient phone in E.164 format, e.g. "+972501234567"
 *   body — plain-text SMS content
 *
 * Returns:
 *   { success: true,  message: Message }  — provider accepted the message
 *   { success: false, reason: string, message: Message }  — send failed;
 *     the Message record is still created with status FAILED so the
 *     failure is auditable in the database.
 *
 * NOTE: No auth guard in Phase 1. Phase 2 will add session-based auth
 * before wiring this to real contract / payment send flows.
 */
export async function POST(request: Request) {
  try {
    const body          = await request.json();
    const to: string    = (body.to   ?? "").trim();
    const text: string  = (body.body ?? "").trim();

    if (!to || !text) {
      return NextResponse.json(
        { error: "Missing required fields: to, body" },
        { status: 400 }
      );
    }

    // Attach to demo user when available — purely for audit linkage.
    const user = await prisma.user.findFirst({
      where:  { email: "demo@signdeal.app" },
      select: { id: true },
    });

    // ── 1. Create Message record BEFORE attempting the send ──────────────────
    // This ensures every send attempt is logged even if the server crashes
    // mid-flight. A PENDING record with no lastAttemptAt signals a crash;
    // the Phase 6 retry engine will sweep these up.
    const message = await prisma.message.create({
      data: {
        type:           "SIGNING_REMINDER",  // placeholder type for the test route
        channel:        "SMS",
        provider:       "infobip",
        body:           text,
        recipientPhone: to,
        status:         "PENDING",
        attempts:       0,
        ...(user ? { userId: user.id } : {}),
      },
    });

    // ── 2. Attempt the send ──────────────────────────────────────────────────
    const result = await sendSms({ to, body: text });

    // ── 3. Update the record with the outcome ────────────────────────────────
    if (result.ok) {
      const updated = await prisma.message.update({
        where: { id: message.id },
        data:  {
          status:            "SENT",
          providerMessageId: result.messageId,
          attempts:          1,
          lastAttemptAt:     new Date(),
        },
      });

      return NextResponse.json({ success: true, message: updated });
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data:  {
        status:        "FAILED",
        failureReason: result.reason,
        attempts:      1,
        lastAttemptAt: new Date(),
      },
    });

    // HTTP 200 is intentional: the route itself succeeded. The SMS did not.
    // The caller can distinguish via `success: false`.
    return NextResponse.json(
      { success: false, reason: result.reason, message: updated },
      { status: 200 }
    );

  } catch (error) {
    console.error("[POST /api/messages/send-sms-test]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
