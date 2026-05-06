/**
 * Email provider — stub when RESEND_API_KEY is absent, live Resend otherwise.
 *
 * Usage:
 *   import { sendEmail } from "@/lib/messaging/email-provider";
 *   void sendEmail({ to, subject, text }).catch(err => console.error("[sendEmail]", err));
 */

export type EmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: string };

export interface SendEmailParams {
  to:       string;
  subject:  string;
  text:     string;
  html?:    string;
}

export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    // Stub — log and return success so callers never fail because of missing key.
    console.log(
      `[sendEmail] STUB (no RESEND_API_KEY) — would send:\n` +
      `  to:      ${params.to}\n` +
      `  subject: ${params.subject}\n` +
      `  body:    ${params.text.slice(0, 120).replace(/\n/g, "\\n")}`,
    );
    return { ok: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    process.env.EMAIL_FROM ?? "SignDeal <noreply@signdeal.co.il>",
        to:      [params.to],
        subject: params.subject,
        text:    params.text,
        ...(params.html ? { html: params.html } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, messageId: data.id };

  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
