import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/messaging/sms-provider";
import { requireUserId } from "@/lib/require-user";

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
 * Auth required. Disabled entirely in production (returns 404).
 */
export async function POST(request: Request) {
  // ── Disabled in production — return 404 so the route is invisible to attackers
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Auth guard — must be a signed-in broker even in dev/staging
  const authResult = await requireUserId();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

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

    // ── 1. Create Message record BEFORE attempting the send ──────────────────
    // Linked to the authenticated broker (userId from session).
    const message = await prisma.message.create({
      data: {
        type:           "SIGNING_REMINDER",  // placeholder type for the test route
        channel:        "SMS",
        provider:       "infobip",
        body:           text,
        recipientPhone: to,
        userId,
        status:         "PENDING",
        attempts:       0,
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
