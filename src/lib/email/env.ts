/**
 * email/env.ts
 *
 * Reads and validates all email-related environment variables.
 * Call getEmailConfig() anywhere — values are re-read on each call so
 * they stay fresh after hot-reload in dev without module-level caching.
 *
 * Required in production:
 *   RESEND_API_KEY   — Resend API key (re_...)
 *   EMAIL_FROM       — Sender address shown to recipients
 *                      Format: "Name <address@domain.com>"
 *                      Resend requires a verified domain.
 * Optional:
 *   EMAIL_REPLY_TO   — Reply-to address (defaults to none)
 */

export interface EmailConfig {
  /** Resend API key, or null when not set (stub mode). */
  apiKey:   string | null;
  /** From address — defaults to "SignDeal <noreply@signdeal.co.il>". */
  from:     string;
  /** Reply-to address — undefined when EMAIL_REPLY_TO is not set. */
  replyTo:  string | undefined;
  /** true when RESEND_API_KEY is set and non-empty. */
  isLive:   boolean;
}

export function getEmailConfig(): EmailConfig {
  const apiKey  = process.env.RESEND_API_KEY?.trim()   || null;
  const from    = process.env.EMAIL_FROM?.trim()        || "SignDeal <noreply@signdeal.co.il>";
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()   || undefined;

  return { apiKey, from, replyTo, isLive: Boolean(apiKey) };
}

/**
 * Logs a startup warning when email is not configured.
 * Call from API route handlers if you want an early-warning log line.
 */
export function warnIfEmailUnconfigured(context: string): void {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      `[email] ${context}: RESEND_API_KEY is not set — emails will be stubbed (logged only).`,
    );
  }
}
