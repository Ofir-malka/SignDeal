import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface PaymentFailedEmailData {
  /** Broker receiving the notification. */
  brokerName:       string;
  /** Hebrew plan label, e.g. "מסלול פרו". */
  plan:             string;
  /** Hebrew interval label: "חודשי" | "שנתי". */
  billingInterval:  string;
  /** Amount in NIS (full currency units). */
  amountNis:        number;
  /** Which attempt this was (1, 2, 3 …). */
  attemptNumber:    number;
  /**
   * True when the subscription is now PAST_DUE (max failures reached).
   * Controls urgency copy — access warning is shown prominently.
   */
  isMaxFailures:    boolean;
  /**
   * Human-readable next retry date, e.g. "25 במאי 2026".
   * Null when isMaxFailures=true (no further automatic retry).
   */
  retryDate:        string | null;
  /** URL for the "update payment method" CTA. */
  updatePaymentUrl: string;
}

function formatNis(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style:                "currency",
    currency:             "ILS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function paymentFailedEmail(data: PaymentFailedEmailData): EmailTemplate {
  const {
    brokerName, plan, billingInterval, amountNis,
    attemptNumber, isMaxFailures, retryDate, updatePaymentUrl,
  } = data;

  const firstName       = brokerName.trim().split(/\s+/)[0];
  const amountFormatted = formatNis(amountNis);

  const subject = isMaxFailures
    ? `⚠️ תשלום המנוי נכשל — נדרשת עדכון אמצעי תשלום בדחיפות`
    : `⚠️ תשלום המנוי נכשל — ${plan} ${amountFormatted}`;

  // ── Plain-text version ────────────────────────────────────────────────────
  const retryLine = retryDate
    ? `ניסיון החיוב הבא יבוצע ב-${retryDate}.`
    : `לא יבוצעו ניסיונות חיוב נוספים.`;

  const accessWarning = isMaxFailures
    ? [
        "",
        "⚠️ הגישה שלך עשויה להיות מוגבלת עד לעדכון אמצעי התשלום.",
        "לא תוכל ליצור חוזים חדשים ולא לשלוח בקשות תשלום.",
      ]
    : [];

  const text = [
    `שלום ${firstName},`,
    "",
    `חיוב המנוי שלך ב-SignDeal לא הצליח.`,
    "",
    `מסלול: ${plan} (${billingInterval})`,
    `סכום: ${amountFormatted}`,
    `ניסיון מספר: ${attemptNumber}`,
    "",
    retryLine,
    ...accessWarning,
    "",
    "לעדכון אמצעי תשלום:",
    updatePaymentUrl,
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  // ── HTML version ──────────────────────────────────────────────────────────
  const urgencyBg    = isMaxFailures ? "#fef2f2" : "#fff7ed";
  const urgencyBdr   = isMaxFailures ? "#fecaca" : "#fed7aa";
  const urgencyColor = isMaxFailures ? "#991b1b" : "#92400e";

  const retryHtml = retryDate
    ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">
         ניסיון חיוב נוסף יבוצע ב-<strong>${escHtml(retryDate)}</strong>
       </p>`
    : `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">
         לא יבוצעו ניסיונות חיוב נוספים — יש לעדכן אמצעי תשלום ידנית.
       </p>`;

  const accessWarningHtml = isMaxFailures
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
         <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">
           ⚠️ הגישה שלך עשויה להיות מוגבלת
         </p>
         <p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;">
           לא תוכל ליצור חוזים חדשים או לשלוח בקשות תשלום עד שאמצעי התשלום יעודכן.
         </p>
       </div>`
    : "";

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      תשלום המנוי נכשל
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(firstName)}, לצערנו לא הצלחנו לחייב את אמצעי התשלום שלך.
    </p>
    <div style="background:${urgencyBg};border:1px solid ${urgencyBdr};border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${urgencyColor};">
        💳 חיוב נכשל — ${escHtml(amountFormatted)}
      </p>
      <p style="margin:4px 0;font-size:14px;color:#374151;">
        📋 <strong>מסלול:</strong> ${escHtml(plan)} (${escHtml(billingInterval)})
      </p>
      <p style="margin:4px 0;font-size:13px;color:#6b7280;">
        ניסיון מספר ${escHtml(String(attemptNumber))}
      </p>
      ${retryHtml}
    </div>
    ${accessWarningHtml}
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      כדי להמשיך ליהנות משירות SignDeal, עדכן את אמצעי התשלום שלך כעת:
    </p>
    ${ctaButton(updatePaymentUrl, "עדכון אמצעי תשלום")}
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      יש שאלות? פנה אלינו בכתובת
      <a href="mailto:support@signdeal.co.il" style="color:#4f46e5;">support@signdeal.co.il</a>
    </p>
  `);

  return { subject, text, html };
}
