import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface TrialExpiredEmailData {
  /** Broker receiving the notification. */
  brokerName:     string;
  /** Human-readable date the trial ended, e.g. "20 במאי 2026". */
  trialEndedAt:   string;
  /** URL for the "reactivate" CTA — typically /onboarding/billing or /pricing. */
  reactivateUrl:  string;
}

export function trialExpiredEmail(data: TrialExpiredEmailData): EmailTemplate {
  const { brokerName, trialEndedAt, reactivateUrl } = data;
  const firstName = brokerName.trim().split(/\s+/)[0];

  const subject = `SignDeal — תקופת הניסיון שלך הסתיימה`;

  // ── Plain-text version ────────────────────────────────────────────────────
  const text = [
    `שלום ${firstName},`,
    "",
    `תקופת הניסיון החינמי שלך ב-SignDeal הסתיימה ב-${trialEndedAt}.`,
    "",
    "מכיוון שלא נשמר אמצעי תשלום בחשבונך, הגישה לתכונות המנוי הושהתה.",
    "",
    "כל הנתונים שלך — חוזים, לקוחות ונכסים — שמורים ומחכים לך.",
    "",
    "כדי לחדש את הגישה, בחר מסלול מנוי:",
    reactivateUrl,
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  // ── HTML version ──────────────────────────────────────────────────────────
  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      תקופת הניסיון הסתיימה
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(firstName)},
    </p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#991b1b;">
        ⏰ תקופת הניסיון הסתיימה ב-${escHtml(trialEndedAt)}
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;">
        הגישה לתכונות המנוי הושהתה — לא נשמר אמצעי תשלום בחשבונך.
      </p>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">
        ✅ הנתונים שלך שמורים
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#15803d;line-height:1.5;">
        כל החוזים, הלקוחות והנכסים שיצרת ממתינים לך — שום דבר לא נמחק.
      </p>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      כדי להמשיך לנהל עסקאות ב-SignDeal, בחר מסלול מנוי שמתאים לך:
    </p>

    ${ctaButton(reactivateUrl, "חדש גישה עכשיו")}

    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      יש שאלות? פנה אלינו בכתובת
      <a href="mailto:support@signdeal.co.il" style="color:#4f46e5;">support@signdeal.co.il</a>
    </p>
  `);

  return { subject, text, html };
}
