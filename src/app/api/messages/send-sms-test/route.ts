/**
 * POST /api/messages/send-sms-test
 *
 * Developer-only route: sends a test SMS via the shared sendSms helper and
 * records the full PENDING → SENT/FAILED lifecycle in the Message table.
 *
 * Body: { to: string, body: string }
 *   to   — recipient phone in E.164 format, e.g. "+972501234567"
 *   body — plain-text SMS content (max 1 600 chars)
 *
 * Access:
 *   - Production (NODE_ENV=production) with ENABLE_TEST_SMS_ROUTES≠"true" → 404
 *   - Unauthenticated session → 401
 *   - Email not in INTERNAL_ADMIN_EMAILS → 403
 *
 * Returns:
 *   { success: true,  messageId: string, dbId: string }
 *   { success: false, reason: string,    dbId: string }
 *
 * dbId is the Message table primary key so the caller can correlate with
 * GET /api/test-sms/status?messageId={providerMessageId}.
 */

import { NextResponse }             from "next/server";
import { prisma }                   from "@/lib/prisma";
import { sendSms }                  from "@/lib/messaging/sms-provider";
import { requireTestRouteAccess }   from "@/lib/require-test-route";

const MAX_BODY_CHARS = 1_600;

export async function POST(request: Request) {
  const gate = await requireTestRouteAccess();
  if (!gate.ok) return gate.response;
  const { userId } = gate;

  let to: string;
  let text: string;
  try {
    const body = await request.json();
    to   = String(body.to   ?? "").trim();
    text = String(body.body ?? "").trim();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected: { to, body }" },
      { status: 400 },
    );
  }

  if (!to || !text) {
    return NextResponse.json(
      { error: "Missing required fields: to, body" },
      { status: 400 },
    );
  }

  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: `Body too long — max ${MAX_BODY_CHARS} characters` },
      { status: 400 },
    );
  }

  console.log(`[POST /api/messages/send-sms-test] to="${to}" by=${gate.email}`);

  // ── 1. Create PENDING record before the network call ─────────────────────────
  // A PENDING row with no lastAttemptAt signals a mid-flight crash.
  const message = await prisma.message.create({
    data: {
      type:           "SIGNING_REMINDER",   // placeholder type for test route
      channel:        "SMS",
      provider:       "infobip",
      body:           text,
      recipientPhone: to,
      userId,
      status:         "PENDING",
      attempts:       0,
    },
  });

  // ── 2. Send ───────────────────────────────────────────────────────────────────
  const result = await sendSms({ to, body: text });

  // ── 3. Persist outcome ────────────────────────────────────────────────────────
  if (result.ok) {
    await prisma.message.update({
      where: { id: message.id },
      data:  {
        status:            "SENT",
        providerMessageId: result.messageId,
        attempts:          1,
        lastAttemptAt:     new Date(),
      },
    });
    console.log(`[POST /api/messages/send-sms-test] sent OK — messageId=${result.messageId}`);
    return NextResponse.json({
      success:   true,
      messageId: result.messageId,
      dbId:      message.id,
    });
  }

  await prisma.message.update({
    where: { id: message.id },
    data:  {
      status:        "FAILED",
      failureReason: result.reason,
      attempts:      1,
      lastAttemptAt: new Date(),
    },
  });
  console.error(`[POST /api/messages/send-sms-test] send failed — reason=${result.reason}`);
  // HTTP 200: the route succeeded. The SMS did not. Caller checks success field.
  return NextResponse.json(
    { success: false, reason: result.reason ?? "SMS send failed", dbId: message.id },
    { status: 200 },
  );
}
