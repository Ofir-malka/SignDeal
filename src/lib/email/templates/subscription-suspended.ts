import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface SubscriptionSuspendedEmailData {
  /** Broker receiving the notification. */
  brokerName:      string;
  /** Hebrew plan label, e.g. "מסלול פרו". */
  plan:            string;
  /** Hebrew interval label: "חודשי" | "שנתי". */
  billingInterval: string;
  /** Human-readable suspension date, e.g. "20 במאי 2026". */
  suspendedAt:     string;
  /** URL for the "reactivate" CTA — typically /onboarding/billing or /pricing. */
  reactivateUrl:   string;
}

export function subscriptionSuspendedEmail(
  data: SubscriptionSuspendedEmailData,
): EmailTemplate {
  const { brokerName, plan, billingInterval, suspendedAt, reactivateUrl } = data;
  const firstName = brokerName.trim().split(/\s+/)[0];

  const subject = `⚠️ SignDeal — המנוי שלך הושהה`;

  // ── Plain-text version ────────────────────────────────────────────────────
  const text = [
    `שלום ${firstName},`,
    "",
    `המנוי שלך ב-SignDeal (${plan}, ${billingInterval}) הושהה ב-${suspendedAt}.`,
    "",
    "לאחר מספר ניסיונות חיוב שלא הצליחו ותקופת התאוששות שחלפה,",
    "הגישה לתכונות המנוי חויה.",
    "",
    "כל הנתונים שלך — חוזים, לקוחות ונכסים — שמורים ומוגנים.",
    "",
    "כדי לשחזר את הגישה, עדכן אמצעי תשלום ובחר מסלול חדש:",
    reactivateUrl,
    "",
    "לשאלות ולסיוע פנה אלינו:",
    "support@signdeal.co.il",
    "",
    "בברכה,",
    "צוות SignDeal",
  ].join("\n");

  // ── HTML version ──────────────────────────────────────────────────────────
  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      המנוי הושהה
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      שלום ${escHtml(firstName)},
    </p>

    <!-- Suspension banner -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;font-size:16px;font-weight:700;color:#991b1b;">
        ⚠️ המנוי הושהה ב-${escHtml(suspendedAt)}
      </p>
      <p style="margin:6px 0 0;font-size:14px;color:#374151;">
        📋 <strong>מסלול:</strong> ${escHtml(plan)} (${escHtml(billingInterval)})
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;line-height:1.5;">
        לאחר מספר ניסיונות חיוב כושלים ותקופת התאוששות, הגישה לתכונות המנוי חויה.
      </p>
    </div>

    <!-- Access blocked notice -->
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">
        🔒 מה הושפע:
      </p>
      <ul style="margin:8px 0 0;padding-right:16px;font-size:13px;color:#78350f;line-height:1.8;">
        <li>יצירת חוזים חדשים</li>
        <li>שליחת בקשות תשלום</li>
        <li>תזכורות SMS ללקוחות</li>
      </ul>
    </div>

    <!-- Data preserved notice -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">
        ✅ הנתונים שלך שמורים ומוגנים
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#15803d;line-height:1.5;">
        כל החוזים, הלקוחות והנכסים שיצרת שמורים — שום דבר לא נמחק.
        ניתן לשחזר את הגישה בכל עת.
      </p>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      כדי לשחזר גישה מלאה, בחר מסלול מנוי ועדכן אמצעי תשלום:
    </p>

    ${ctaButton(reactivateUrl, "שחזר גישה עכשיו")}

    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      יש שאלות? פנה אלינו בכתובת
      <a href="mailto:support@signdeal.co.il" style="color:#4f46e5;">support@signdeal.co.il</a>
      — נשמח לעזור.
    </p>
  `);

  return { subject, text, html };
}
