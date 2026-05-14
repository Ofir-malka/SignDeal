/**
 * lib/messaging/notify.ts
 *
 * Canonical single-message send helper.
 * All new notification sends should use this instead of calling sendSms/sendEmail directly.
 *
 * Architecture:
 * - Never throws — all outcomes (SENT/FAILED/CANCELED) are persisted to the Message table.
 * - SMS_TEST_PHONE guard handled internally (creates CANCELED records, not errors).
 * - WhatsApp-ready: pass channel: "WHATSAPP" once Infobip / 360dialog WA Business API
 *   is configured. Until then, the channel is stored in the DB record for auditability
 *   and the send falls through to SMS so the message is not lost.
 * - Email path: Resend API; stubs gracefully when RESEND_API_KEY is absent.
 */

import { prisma } from "@/lib/prisma";
import { sendSms, getSmsProviderName } from "@/lib/messaging/sms-provider";
import { sendEmail } from "@/lib/email";   // consolidated provider — HTML + reply-to supported
import { normalizeIsraeliPhone } from "@/lib/messaging/normalize-phone";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifyChannel = "SMS" | "WHATSAPP" | "EMAIL";

export type NotifyMsgType =
  | "CONTRACT_SIGNING_LINK"
  | "PAYMENT_REQUEST_LINK"
  | "SIGNING_REMINDER"
  | "PAYMENT_REMINDER"
  | "BROKER_CONTRACT_SIGNED"
  | "BROKER_PAYMENT_RECEIVED";

export interface NotifyParams {
  // What kind of message
  type:    NotifyMsgType;
  channel: NotifyChannel;
  body:    string;
  // Recipient — provide phone for SMS/WhatsApp, email for EMAIL
  recipientPhone?: string;
  recipientEmail?: string;
  subject?:        string;  // email only
  // Context links (all optional — attach what is relevant)
  userId?:     string;
  contractId?: string;
  clientId?:   string;
  paymentId?:  string;
}

export interface NotifyResult {
  /** true = message was sent (SENT status in DB) */
  ok:         boolean;
  /** true = blocked by SMS_TEST_PHONE guard — not a real failure, treat as soft-ok */
  skipped?:   boolean;
  /** DB Message.id */
  messageId?: string;
  reason?:    string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export async function sendNotification(params: NotifyParams): Promise<NotifyResult> {
  const {
    type, channel, body,
    recipientPhone, recipientEmail, subject,
    userId, contractId, clientId, paymentId,
  } = params;

  try {
    // ── EMAIL ─────────────────────────────────────────────────────────────────
    if (channel === "EMAIL") {
      if (!recipientEmail) {
        console.warn(`[notify] ${type}/EMAIL skipped — no recipientEmail`);
        return { ok: false, reason: "no recipientEmail" };
      }

      console.log(`[notify] ${type}/EMAIL → ${recipientEmail}`);

      const msg = await prisma.message.create({
        data: {
          type, channel: "EMAIL", provider: "resend", body,
          subject:        subject ?? "",
          contractId,     clientId, paymentId, userId,
          recipientEmail,
          status:   "PENDING",
          attempts: 0,
        },
      });

      const result = await sendEmail({ to: recipientEmail, subject: subject ?? "", text: body });

      await prisma.message.update({
        where: { id: msg.id },
        data: result.ok
          ? { status: "SENT",   providerMessageId: result.messageId, attempts: 1, lastAttemptAt: new Date() }
          : { status: "FAILED", failureReason: result.reason,        attempts: 1, lastAttemptAt: new Date() },
      });

      if (!result.ok) console.error(`[notify] ${type}/EMAIL failed for ${recipientEmail}:`, result.reason);
      else           console.log(`[notify] ${type}/EMAIL sent — providerMsgId=${result.messageId ?? "n/a"}`);

      return result.ok
        ? { ok: true,  messageId: msg.id }
        : { ok: false, messageId: msg.id, reason: result.reason };
    }

    // ── SMS / WHATSAPP ────────────────────────────────────────────────────────
    if (channel === "SMS" || channel === "WHATSAPP") {
      if (!recipientPhone) {
        console.warn(`[notify] ${type}/${channel} skipped — no recipientPhone`);
        return { ok: false, reason: "no recipientPhone" };
      }

      const normalizedPhone = normalizeIsraeliPhone(recipientPhone);

      // SMS_TEST_PHONE guard — blocks non-test numbers in dev/staging
      const testPhone      = process.env.SMS_TEST_PHONE?.trim() ?? "";
      const normalizedTest = testPhone ? normalizeIsraeliPhone(testPhone) : "";

      if (normalizedTest && normalizedPhone !== normalizedTest) {
        console.log(
          `[notify] ${type}/${channel} skipped — ${normalizedPhone} ≠ SMS_TEST_PHONE (${normalizedTest})`,
        );
        const msg = await prisma.message.create({
          data: {
            type, channel: "SMS", provider: getSmsProviderName(), body,
            contractId, clientId, paymentId, userId,
            recipientPhone: normalizedPhone,
            status:        "CANCELED",
            failureReason: "skipped: phone does not match SMS_TEST_PHONE",
            attempts:      0,
          },
        });
        return { ok: false, skipped: true, messageId: msg.id, reason: "skipped by SMS_TEST_PHONE" };
      }

      // WhatsApp-ready branch: when WA Business API is wired, replace the sendSms call
      // below with sendWhatsApp (a future lib/messaging/whatsapp-provider.ts module).
      // The channel stored in the DB will still reflect the intended channel.
      if (channel === "WHATSAPP") {
        console.warn(
          `[notify] WHATSAPP channel requested for ${type} — WA Business API not yet wired. ` +
          `Falling through to SMS delivery so the message is not lost.`,
        );
        // Falls through to SMS send below — the DB channel field is intentionally "SMS"
        // so the record accurately reflects what was actually used.
      }

      console.log(`[notify] ${type}/SMS → ${normalizedPhone}`);

      const msg = await prisma.message.create({
        data: {
          type, channel: "SMS", provider: getSmsProviderName(), body,
          contractId, clientId, paymentId, userId,
          recipientPhone: normalizedPhone,
          status:   "PENDING",
          attempts: 0,
        },
      });

      const result = await sendSms({ to: normalizedPhone, body });

      await prisma.message.update({
        where: { id: msg.id },
        data: result.ok
          ? { status: "SENT",   providerMessageId: result.messageId, attempts: 1, lastAttemptAt: new Date() }
          : { status: "FAILED", failureReason: result.reason,        attempts: 1, lastAttemptAt: new Date() },
      });

      if (!result.ok) {
        console.error(`[notify] ${type}/SMS failed for ${normalizedPhone}:`, result.reason);
      } else {
        console.log(
          `[notify] ${type}/SMS sent to ${normalizedPhone} — providerMsgId=${result.messageId}`,
        );
      }

      return result.ok
        ? { ok: true,  messageId: msg.id }
        : { ok: false, messageId: msg.id, reason: result.reason };
    }

    return { ok: false, reason: `Unknown channel: ${channel as string}` };

  } catch (err) {
    console.error(`[notify] unexpected error sending ${type}/${channel}:`, err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
