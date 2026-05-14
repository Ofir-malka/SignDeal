/**
 * @/lib/email — transactional email layer for SignDeal.
 *
 * ── Quick start ───────────────────────────────────────────────────────────────
 *   import { sendEmail, welcomeEmail } from "@/lib/email";
 *
 *   const template = welcomeEmail({ fullName: "רוני לוי" });
 *   const result   = await sendEmail({ to: "roni@example.com", ...template });
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *   env.ts            — reads / validates RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO
 *   provider.ts       — EmailProvider interface + ResendProvider + sendEmail()
 *   templates/        — pure functions that return { subject, html, text }
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *   RESEND_API_KEY    required  Resend API key (re_...). Emails are stubbed when absent.
 *   EMAIL_FROM        required  Sender shown to recipients: "SignDeal <hello@signdeal.co.il>"
 *   EMAIL_REPLY_TO    optional  Reply-to address.
 */

// Provider
export { sendEmail, emailProvider }  from "./provider";
export type { EmailProvider, EmailTemplate, SendEmailOptions, EmailResult, EmailAttachment } from "./provider";

// Env
export { getEmailConfig, warnIfEmailUnconfigured } from "./env";
export type { EmailConfig }                         from "./env";

// Templates
export * from "./templates/index";
