/**
 * SMS provider abstraction — Infobip.
 *
 * Returns a typed result union instead of throwing, so callers can
 * persist the failure reason to the Message record without a try/catch
 * at every call site.
 *
 * Phase 2 TODO: extract a shared ProviderResult<T> type used by the
 * future email-provider.ts and whatsapp-provider.ts modules.
 *
 * Infobip SMS API reference:
 * https://www.infobip.com/docs/api/channels/sms/sms-messaging/outbound-sms/send-sms-message
 */

export type SmsResult =
  | { ok: true;  messageId: string }
  | { ok: false; reason: string };

export type SendSmsParams = {
  /** Recipient phone number in E.164 format, e.g. "+972501234567" */
  to:   string;
  /** Plain-text message body. Hebrew (UTF-8/UCS-2) is supported by Infobip. */
  body: string;
};

/**
 * Sends an SMS via Infobip.
 *
 * - Returns `{ ok: true, messageId }` when the provider accepts the message.
 * - Returns `{ ok: false, reason }` for missing credentials, network errors,
 *   or provider rejections.
 *
 * NEVER throws. NEVER returns ok:true when credentials are absent.
 */
export async function sendSms({ to, body }: SendSmsParams): Promise<SmsResult> {
  const baseUrl = process.env.INFOBIP_BASE_URL?.trim();
  const apiKey  = process.env.INFOBIP_API_KEY?.trim();
  const sender  = process.env.INFOBIP_SMS_SENDER?.trim() || "";

  // Fail immediately and clearly if credentials are not configured.
  // An empty string is treated the same as missing — no silent no-ops.
  if (!baseUrl || !apiKey) {
    return {
      ok:     false,
      reason: "SMS provider not configured: INFOBIP_BASE_URL or INFOBIP_API_KEY is missing",
    };
  }

  console.log(
    `[sendSms] to=${to} sender=${sender || "(provider default)"} baseUrl=${baseUrl}`,
  );

  const url = `${baseUrl}/sms/2/text/advanced`;

  const payload = {
    messages: [
      {
        // Only include `from` if a sender name is configured.
        // Omitting it lets Infobip use the account's default numeric sender,
        // which works immediately without alphanumeric sender approval.
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

    // Always try to parse JSON regardless of status — Infobip returns error
    // details in the body even on 4xx/5xx responses.
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      // Infobip error shape: { requestError: { serviceException: { text, messageId } } }
      const detail =
        (json as { requestError?: { serviceException?: { text?: string; messageId?: string } } })
          ?.requestError?.serviceException?.text ??
        (json as { requestError?: { serviceException?: { messageId?: string } } })
          ?.requestError?.serviceException?.messageId ??
        `HTTP ${res.status}`;
      return { ok: false, reason: `Infobip error: ${detail}` };
    }

    // Success response shape: { messages: [{ messageId: string, status: {...} }] }
    const messageId =
      (json as { messages?: { messageId?: string }[] })?.messages?.[0]?.messageId;

    if (!messageId) {
      return {
        ok:     false,
        reason: "Infobip accepted the request but returned no messageId",
      };
    }

    // TODO (Phase 3): Infobip sends delivery reports via webhook after the
    // initial acceptance. Wire up POST /api/messages/delivery-report to update
    // Message.status from SENT → DELIVERED (or FAILED) using providerMessageId.

    return { ok: true, messageId };

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Network error calling Infobip: ${reason}` };
  }
}
