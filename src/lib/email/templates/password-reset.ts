/**
 * email/templates/password-reset.ts
 *
 * Sent when a user requests a password reset.
 * The `resetLink` already contains the raw token — the template never
 * generates tokens itself; that is the API route's responsibility.
 *
 * Security notes embedded in this template:
 * • The link is single-use and expires in 1 hour.
 * • The footer explicitly tells the recipient to ignore the email if
 *   they didn't request a reset (prevents phishing confusion).
 */

import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface PasswordResetEmailData {
  /** Full name of the user — used in the salutation. */
  fullName:         string;
  /** Full HTTPS URL containing the raw token as a query parameter. */
  resetLink:        string;
  /** How long the link stays valid, in minutes. Should match the server-side expiry. */
  expiresInMinutes: number;
}

export function passwordResetEmail(data: PasswordResetEmailData): EmailTemplate {
  const { fullName, resetLink, expiresInMinutes } = data;
  const firstName = fullName.trim().split(/\s+/)[0] || fullName.trim();

  // Human-friendly expiry string (e.g. "שעה אחת", "30 דקות")
  const expiryLabel =
    expiresInMinutes === 60
      ? "שעה אחת (60 דקות)"
      : expiresInMinutes === 30
        ? "30 דקות"
        : `${expiresInMinutes} דקות`;

  const subject = "איפוס סיסמה — SignDeal";

  const text = [
    `שלום ${fullName},`,
    "",
    "קיבלנו בקשה לאיפוס הסיסמה לחשבון SignDeal שלך.",
    "",
    `לחץ/י על הקישור הבא לאיפוס הסיסמה (תקף ל-${expiryLabel}):`,
    resetLink,
    "",
    "הקישור הוא לשימוש חד-פעמי ויפוג לאחר האיפוס.",
    "",
    "אם לא ביקשת איפוס סיסמה — ניתן להתעלם מאימייל זה.",
    "הסיסמה שלך לא תשתנה ללא שימוש בקישור.",
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      איפוס סיסמה
    </h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(firstName)},
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
      קיבלנו בקשה לאיפוס הסיסמה לחשבון SignDeal שלך.
      לחץ/י על הכפתור למטה כדי להגדיר סיסמה חדשה.
    </p>
    ${ctaButton(resetLink, "איפוס סיסמה")}
    <p style="margin:20px 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">
      ⏱ הקישור תקף ל-<strong>${escHtml(expiryLabel)}</strong> בלבד ולשימוש חד-פעמי.
    </p>
    <p style="margin:0 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      אם לא ביקשת איפוס סיסמה — ניתן להתעלם מאימייל זה לחלוטין.
      הסיסמה שלך לא תשתנה ללא שימוש בקישור.
    </p>
  `);

  return { subject, text, html };
}
