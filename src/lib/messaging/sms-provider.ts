/**
 * SMS provider abstraction — Twilio (primary) + Infobip (legacy fallback).
 *
 * Provider selection via environment variable:
 *   SMS_PROVIDER=twilio    → Twilio  (default when switching)
 *   SMS_PROVIDER=infobip   → Infobip (legacy; fallback when SMS_PROVIDER is unset)
 *
 * The public API is unchanged — callers only see:
 *   sendSms(params)       → SmsResult
 *   getSmsProviderName()  → "twilio" | "infobip"   (used to populate Message.provider)
 *
 * NEVER throws. NEVER returns ok:true when credentials are absent.
 */

import twilio from "twilio";

// ── Public types ───────────────────────────────────────────────────────────────

export type SmsResult =
  | { ok: true;  messageId: string }
  | { ok: false; reason: string };

export type SendSmsParams = {
  /** Recipient phone number in E.164 format, e.g. "+972501234567" */
  to:   string;
  /** Plain-text message body. Hebrew (UTF-8) is supported by both providers. */
  body: string;
};

// ── Provider selection ─────────────────────────────────────────────────────────

/**
 * Returns the active SMS provider slug.
 * Used by notify.ts to set Message.provider on every outbound record.
 */
export function getSmsProviderName(): "twilio" | "infobip" {
  const p = (process.env.SMS_PROVIDER ?? "").toLowerCase().trim();
  return p === "twilio" ? "twilio" : "infobip";
}

// ── Twilio ─────────────────────────────────────────────────────────────────────

async function sendViaTwilio({ to, body }: SendSmsParams): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken  = process.env.TWILIO_AUTH_TOKEN?.trim();
  const senderId   = process.env.TWILIO_SENDER_ID?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const from       = senderId || phoneNumber;

  if (!accountSid || !authToken || !from) {
    return {
      ok:     false,
      reason: "SMS provider not configured: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_SENDER_ID or TWILIO_PHONE_NUMBER are required",
    };
  }

  const senderType = senderId ? "senderId" : "phoneNumber";
  console.log(`[sendSms/twilio] to=${to} senderType=${senderType}`);

  try {
    const client  = twilio(accountSid, authToken);
    const message = await client.messages.create({ body, from, to });

    if (!message.sid) {
      return { ok: false, reason: "Twilio accepted the request but returned no SID" };
    }

    // TODO (delivery receipts): Twilio sends status callbacks via webhook.
    // Wire POST /api/messages/delivery-report to update Message.status
    // from SENT → DELIVERED using providerMessageId (= message.sid).

    return { ok: true, messageId: message.sid };

  } catch (err) {
    // Twilio SDK throws TwilioRestException (extends Error) on API errors.
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Twilio error: ${reason}` };
  }
}

// ── Infobip (legacy) ───────────────────────────────────────────────────────────
//
// Kept as-is so existing Infobip-configured environments continue working
// without any config change.  Set SMS_PROVIDER=twilio to switch.
//
// Infobip SMS API reference:
// https://www.infobip.com/docs/api/channels/sms/sms-messaging/outbound-sms/send-sms-message

async function sendViaInfobip({ to, body }: SendSmsParams): Promise<SmsResult> {
  const baseUrl = process.env.INFOBIP_BASE_URL?.trim();
  const apiKey  = process.env.INFOBIP_API_KEY?.trim();
  const sender  = process.env.INFOBIP_SMS_SENDER?.trim() || "";

  if (!baseUrl || !apiKey) {
    return {
      ok:     false,
      reason: "SMS provider not configured: INFOBIP_BASE_URL or INFOBIP_API_KEY is missing",
    };
  }

  console.log(
    `[sendSms/infobip] to=${to} sender=${sender || "(provider default)"} baseUrl=${baseUrl}`,
  );

  const url = `${baseUrl}/sms/2/text/advanced`;

  const payload = {
    messages: [
      {
        ...(sender ? { from: sender } : {}),
        destinations: [{ to }],
        text:         body,
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `App ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const detail =
        (json as { requestError?: { serviceException?: { text?: string; messageId?: string } } })
          ?.requestError?.serviceException?.text ??
        (json as { requestError?: { serviceException?: { messageId?: string } } })
          ?.requestError?.serviceException?.messageId ??
        `HTTP ${res.status}`;
      return { ok: false, reason: `Infobip error: ${detail}` };
    }

    const messageId =
      (json as { messages?: { messageId?: string }[] })?.messages?.[0]?.messageId;

    if (!messageId) {
      return {
        ok:     false,
        reason: "Infobip accepted the request but returned no messageId",
      };
    }

    // TODO (delivery receipts): wire POST /api/messages/delivery-report
    // to update Message.status SENT → DELIVERED via providerMessageId.

    return { ok: true, messageId };

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Network error calling Infobip: ${reason}` };
  }
}

// ── Public dispatch ────────────────────────────────────────────────────────────

/**
 * Sends an SMS via the configured provider (Twilio or Infobip).
 *
 * Provider is selected by SMS_PROVIDER env var:
 *   "twilio"  → Twilio (recommended)
 *   anything else / unset → Infobip (legacy)
 */
export async function sendSms(params: SendSmsParams): Promise<SmsResult> {
  const provider = getSmsProviderName();
  console.log(`[sendSms] provider=${provider} to=${params.to}`);
  return provider === "twilio"
    ? sendViaTwilio(params)
    : sendViaInfobip(params);
}
