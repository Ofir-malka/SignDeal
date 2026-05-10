import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface TrialEndingEmailData {
  fullName:    string;
  /** ISO date string or human-readable date. */
  trialEndsAt: string;
  /** Number of days remaining. */
  daysLeft:    number;
}

export function trialEndingEmail(data: TrialEndingEmailData): EmailTemplate {
  const { fullName, trialEndsAt, daysLeft } = data;
  const firstName = fullName.trim().split(/\s+/)[0];

  const urgencyWord  = daysLeft <= 1 ? "מחר" : `בעוד ${daysLeft} ימים`;
  const subject      = `תקופת הניסיון שלך מסתיימת ${urgencyWord}`;

  const text = [
    `שלום ${firstName},`,
    "",
    `תקופת הניסיון החינמי שלך ב-SignDeal מסתיימת ב-${trialEndsAt}.`,
    "",
    daysLeft <= 1
      ? "מחר לא תוכל ליצור חוזים חדשים ללא מנוי פעיל."
      : `נותרו לך ${daysLeft} ימים לשדרג ולשמור על גישה מלאה.`,
    "",
    "שדרג לפרו ותמשיך ליהנות מ:",
    "• חוזים ללא הגבלה",
    "• תזכורות SMS ו-WhatsApp",
    "• בקשות תשלום",
    "• לוח בקרה מתקדם",
    "",
    "שדרג עכשיו:",
    "https://www.signdeal.co.il/pricing",
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  const urgencyBg    = daysLeft <= 1 ? "#fef2f2" : "#fff7ed";
  const urgencyBdr   = daysLeft <= 1 ? "#fecaca" : "#fed7aa";
  const urgencyColor = daysLeft <= 1 ? "#991b1b" : "#92400e";
  const urgencyText  = daysLeft <= 1
    ? "⚠️ תקופת הניסיון מסתיימת <strong>מחר</strong>"
    : `⏰ נותרו <strong>${daysLeft} ימים</strong> לתקופת הניסיון`;

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      תקופת הניסיון מסתיימת בקרוב
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(firstName)},
    </p>
    <div style="background:${urgencyBg};border:1px solid ${urgencyBdr};border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:15px;color:${urgencyColor};">${urgencyText}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">תאריך סיום: ${escHtml(trialEndsAt)}</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שדרג ל-<strong>PRO</strong> וקבל גישה מלאה לכל הכלים:
    </p>
    <ul style="margin:0 0 20px;padding-right:20px;font-size:14px;color:#374151;line-height:2;">
      <li>חוזים ללא הגבלה</li>
      <li>תזכורות SMS ו-WhatsApp ללקוחות</li>
      <li>בקשות תשלום ישירות מהחוזה</li>
      <li>לוח בקרה מתקדם עם היסטוריה מלאה</li>
    </ul>
    ${ctaButton("https://www.signdeal.co.il/pricing", "שדרג ל-PRO עכשיו")}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">
      חוזים קיימים יישארו נגישים לצפייה גם לאחר סיום הניסיון.
    </p>
  `);

  return { subject, text, html };
}
