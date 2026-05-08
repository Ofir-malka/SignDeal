/**
 * POST /api/test-sms
 *
 * Developer-only route — fires a real Infobip SMS to verify delivery.
 *
 * Body:  { "to": "+972XXXXXXXXX" }
 *
 * Access:
 *   - Production (NODE_ENV=production) with ENABLE_TEST_SMS_ROUTES≠"true" → 404
 *   - Unauthenticated session → 401
 *   - Email not in INTERNAL_ADMIN_EMAILS → 403
 *
 * Never returns raw Infobip API responses or credential-revealing error detail.
 */

import { NextResponse }             from "next/server";
import { requireTestRouteAccess }   from "@/lib/require-test-route";
import { sendSms }                  from "@/lib/messaging/sms-provider";

export async function POST(request: Request) {
  const gate = await requireTestRouteAccess();
  if (!gate.ok) return gate.response;

  let to: string;
  try {
    const body = await request.json();
    to = String(body.to ?? "").trim();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body. Expected: { "to": "+972XXXXXXXXX" }' },
      { status: 400 },
    );
  }

  if (!to) {
    return NextResponse.json(
      { success: false, error: 'Missing required field "to"' },
      { status: 400 },
    );
  }

  console.log(`[POST /api/test-sms] sending test SMS to="${to}" by=${gate.email}`);

  // Use the shared sendSms helper — same path as all real notifications.
  // This also respects SMS_TEST_PHONE so the caller can verify guard behaviour.
  const result = await sendSms({
    to,
    body: "בדיקת SMS מ-SignDeal. אם קיבלת את ההודעה, השליחה עובדת.",
  });

  if (result.ok) {
    console.log(`[POST /api/test-sms] sent OK — messageId=${result.messageId}`);
    return NextResponse.json({ success: true, messageId: result.messageId, to });
  }

  console.error(`[POST /api/test-sms] send failed — reason=${result.reason}`);
  // Return the provider's error text but NOT the full raw response object.
  return NextResponse.json(
    { success: false, error: result.reason ?? "SMS send failed" },
    { status: 502 },
  );
}
