/**
 * POST /api/admin/sms/test
 *
 * Sends a test SMS to SMS_TEST_PHONE using the currently configured provider.
 * Admin role is re-checked against the DB on every call (requireAdmin).
 *
 * Returns a JSON summary:
 *   { ok, provider, to, messageId? }   — on success
 *   { ok, provider, to, reason }       — on send failure
 *   { error }                          — on missing SMS_TEST_PHONE (400)
 *
 * SMS_TEST_PHONE must be set — this endpoint never sends to arbitrary numbers.
 * This endpoint exists purely for development / staging QA.
 */

import { NextResponse }                            from "next/server";
import { requireAdmin }                            from "@/lib/require-admin";
import { sendSms, getSmsProviderName }             from "@/lib/messaging/sms-provider";
import { normalizeIsraeliPhone }                   from "@/lib/messaging/normalize-phone";

export async function POST() {
  // ── Admin gate ───────────────────────────────────────────────────────────────
  const adminResult = await requireAdmin();
  if (adminResult instanceof NextResponse) return adminResult;

  // ── SMS_TEST_PHONE guard ─────────────────────────────────────────────────────
  // We only ever send to the pre-approved test number.  Admins cannot supply an
  // arbitrary destination — this prevents the endpoint from being used as a
  // free SMS relay.
  const rawTestPhone = process.env.SMS_TEST_PHONE?.trim() ?? "";
  if (!rawTestPhone) {
    return NextResponse.json(
      {
        error:   "SMS_TEST_PHONE is not set.",
        hint:    "Add SMS_TEST_PHONE=+972XXXXXXXXX to your environment, then retry.",
      },
      { status: 400 },
    );
  }

  const provider = getSmsProviderName();
  const to       = normalizeIsraeliPhone(rawTestPhone);

  // Timestamp in the body so repeated sends are distinguishable in the provider
  // dashboard without having to rely on send time alone.
  const now  = new Date();
  const time = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const body = `[SignDeal בדיקה] ספק: ${provider} | שעה: ${time}`;

  console.log(`[admin/sms/test] sending via ${provider} → ${to}`);

  const result = await sendSms({ to, body });

  console.log(
    result.ok
      ? `[admin/sms/test] ✓ sent — messageId=${result.messageId}`
      : `[admin/sms/test] ✗ failed — reason=${result.reason}`,
  );

  return NextResponse.json(
    {
      ok:       result.ok,
      provider,
      to,
      ...(result.ok
        ? { messageId: result.messageId }
        : { reason:    result.reason }
      ),
    },
    { status: result.ok ? 200 : 502 },
  );
}
