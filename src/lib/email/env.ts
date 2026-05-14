/**
 * email/env.ts
 *
 * Single source of truth for all email-related configuration.
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *   RESEND_API_KEY   required  Resend API key (re_...).
 *                             When absent: stub mode — emails are logged only.
 *   EMAIL_FROM       required  Sender shown to recipients.
 *                             Format: "Name <address@domain.com>"
 *                             Resend requires a verified domain for the address.
 *                             Default: "SignDeal <noreply@signdeal.co.il>"
 *   EMAIL_REPLY_TO   optional  Reply-to address. Replies from recipients land here.
 *                             Default: SUPPORT_EMAIL ("support@signdeal.co.il")
 *
 * ── Fixed constants ───────────────────────────────────────────────────────────
 *   SUPPORT_EMAIL   Human-operated inbox for replies and support requests.
 *                   Not an env var — it is always support@signdeal.co.il.
 *   NOREPLY_EMAIL   Outbound sender address (must be Resend-verified domain).
 */

// ── Fixed business constants — not configurable via env ───────────────────────

/** Human-operated Google Workspace inbox. All reply-to addresses point here. */
export const SUPPORT_EMAIL = "support@signdeal.co.il";

/** Sending address. Must be on a Resend-verified domain (signdeal.co.il). */
export const NOREPLY_EMAIL = "noreply@signdeal.co.il";

/** Full From header value used as the EMAIL_FROM default. */
export const DEFAULT_FROM = `SignDeal <${NOREPLY_EMAIL}>`;

// ── Config type ───────────────────────────────────────────────────────────────

export interface EmailConfig {
  /** Resend API key, or null when not set (stub mode). */
  apiKey:   string | null;
  /** From address shown to recipients. */
  from:     string;
  /**
   * Reply-to address. Defaults to SUPPORT_EMAIL so that replies from brokers
   * and clients always land in the human-operated inbox.
   */
  replyTo:  string;
  /** true when RESEND_API_KEY is set and non-empty. */
  isLive:   boolean;
}

/**
 * Read email config from environment. Values are re-read on each call to stay
 * fresh after hot-reload in dev — do not cache the return value at module level.
 */
export function getEmailConfig(): EmailConfig {
  const apiKey  = process.env.RESEND_API_KEY?.trim() || null;
  const from    = process.env.EMAIL_FROM?.trim()     || DEFAULT_FROM;
  // Default reply-to to SUPPORT_EMAIL — replies always reach a human inbox.
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || SUPPORT_EMAIL;

  return { apiKey, from, replyTo, isLive: Boolean(apiKey) };
}

/**
 * Log a startup warning when live email is not configured.
 * Call from API route handlers to surface misconfiguration early.
 *
 * @param context  Short label for the log line, e.g. "POST /api/users"
 */
export function warnIfEmailUnconfigured(context: string): void {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn(
      `[email] ${context}: RESEND_API_KEY is not set — emails will be stubbed (logged only). ` +
      `Set RESEND_API_KEY + EMAIL_FROM in production to enable real delivery.`,
    );
  }
}
