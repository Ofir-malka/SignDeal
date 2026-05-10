/**
 * email/provider.ts
 *
 * Provider abstraction for transactional email.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 * • EmailProvider interface — swappable backend (Resend today, SES / Postmark later).
 * • ResendProvider — production implementation using the Resend REST API.
 *   Adds EMAIL_REPLY_TO support that the legacy email-provider.ts does not have.
 * • sendEmail() — the centralized helper callers import from this module.
 * • Stub mode — when RESEND_API_KEY is absent, sends are logged and return ok:true.
 *   No external call is made; development and CI never need real credentials.
 *
 * ── Relationship to legacy code ───────────────────────────────────────────────
 * src/lib/messaging/email-provider.ts   — low-level, used by notify.ts and the
 *   registration flow. Unchanged and still in production use.
 * src/lib/email/provider.ts (THIS FILE) — richer layer used by the new templates
 *   system and the admin test endpoint. Callers going forward should import from
 *   "@/lib/email" (the barrel export).
 */

import { getEmailConfig } from "./env";

// ── Public types ──────────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  /** Plain-text version — required; shown when client cannot render HTML. */
  text:    string;
  /** HTML version — recommended for visual emails. */
  html:    string;
}

export interface SendEmailOptions {
  /** Recipient email address. */
  to:       string;
  subject:  string;
  text:     string;
  html:     string;
  /** Overrides the global EMAIL_REPLY_TO for this specific send. */
  replyTo?: string;
}

export type EmailResult =
  | { ok: true;  messageId?: string }
  | { ok: false; reason: string };

// ── Provider interface ────────────────────────────────────────────────────────

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<EmailResult>;
  /** Returns true when the provider is configured to deliver real emails. */
  isConfigured(): boolean;
}

// ── Resend implementation ─────────────────────────────────────────────────────

class ResendProvider implements EmailProvider {
  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim());
  }

  async send(options: SendEmailOptions): Promise<EmailResult> {
    const config  = getEmailConfig();
    const { to, subject, text, html, replyTo } = options;

    const resolvedReplyTo = replyTo ?? config.replyTo;

    console.log(
      `[ResendProvider] to="${to}" subject="${subject}" ` +
      `live=${config.isLive} replyTo="${resolvedReplyTo ?? "none"}"`,
    );

    // ── Stub mode ─────────────────────────────────────────────────────────────
    if (!config.isLive) {
      console.log(
        `[ResendProvider] STUB — RESEND_API_KEY not set, skipping send.\n` +
        `  subject: ${subject}\n` +
        `  preview: ${text.slice(0, 120).replace(/\n/g, "↵")}`,
      );
      return { ok: true };
    }

    // ── Live send ─────────────────────────────────────────────────────────────
    try {
      const body: Record<string, unknown> = {
        from:    config.from,
        to:      [to],
        subject,
        text,
        html,
      };
      if (resolvedReplyTo) body.reply_to = resolvedReplyTo;

      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const rawBody = await res.text().catch(() => "");

      if (!res.ok) {
        console.error(
          `[ResendProvider] Resend error — status=${res.status} body=${rawBody.slice(0, 300)}`,
        );
        return { ok: false, reason: `Resend ${res.status}: ${rawBody.slice(0, 200)}` };
      }

      let data: { id?: string } = {};
      try { data = JSON.parse(rawBody); } catch { /* ignore parse error */ }

      console.log(`[ResendProvider] accepted — id=${data.id ?? "n/a"}`);
      return { ok: true, messageId: data.id };

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[ResendProvider] network error — ${reason}`);
      return { ok: false, reason: `Network error: ${reason}` };
    }
  }
}

// ── Singleton provider + helper ───────────────────────────────────────────────

/** Singleton ResendProvider. Import sendEmail for one-off sends. */
export const emailProvider: EmailProvider = new ResendProvider();

/**
 * Centralized send helper. Import from "@/lib/email", not directly from this file.
 *
 * @example
 *   import { sendEmail } from "@/lib/email";
 *   import { welcomeEmail } from "@/lib/email";
 *
 *   const template = welcomeEmail({ fullName: "רוני לוי" });
 *   await sendEmail({ to: user.email, ...template });
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  return emailProvider.send(options);
}
