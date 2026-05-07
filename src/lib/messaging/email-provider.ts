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
  const apiKey  = process.env.RESEND_API_KEY?.trim();
  const from    = process.env.EMAIL_FROM?.trim() ?? "SignDeal <noreply@signdeal.co.il>";

  console.log(
    `[sendEmail] RESEND_API_KEY=${apiKey ? `set (${apiKey.length} chars)` : "MISSING"} ` +
    `EMAIL_FROM="${from}" to="${params.to}"`,
  );

  if (!apiKey) {
    // Stub — log and return success so callers never fail because of missing key.
    console.log(
      `[sendEmail] STUB — no RESEND_API_KEY, skipping send:\n` +
      `  subject: ${params.subject}\n` +
      `  body:    ${params.text.slice(0, 120).replace(/\n/g, "\\n")}`,
    );
    return { ok: true };
  }

  try {
    console.log(`[sendEmail] calling Resend API — subject="${params.subject}"`);

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to:      [params.to],
        subject: params.subject,
        text:    params.text,
        ...(params.html ? { html: params.html } : {}),
      }),
    });

    const rawBody = await res.text().catch(() => "");

    if (!res.ok) {
      console.error(`[sendEmail] Resend error — status=${res.status} body=${rawBody.slice(0, 300)}`);
      return { ok: false, reason: `Resend ${res.status}: ${rawBody.slice(0, 200)}` };
    }

    let data: { id?: string } = {};
    try { data = JSON.parse(rawBody); } catch { /* ignore */ }

    console.log(`[sendEmail] Resend accepted — id=${data.id ?? "n/a"}`);
    return { ok: true, messageId: data.id };

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[sendEmail] network error — ${reason}`);
    return { ok: false, reason: `Network error calling Resend: ${reason}` };
  }
}
