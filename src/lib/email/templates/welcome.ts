import { baseHtml, escHtml, ctaButton } from "./base";
import type { EmailTemplate }            from "../provider";

export interface WelcomeEmailData {
  fullName: string;
}

export function welcomeEmail(data: WelcomeEmailData): EmailTemplate {
  const { fullName } = data;
  const firstName    = fullName.trim().split(/\s+/)[0];

  const subject = `ברוך הבא ל-SignDeal, ${firstName}!`;

  const text = [
    `שלום ${fullName},`,
    "",
    "ברוך הבא ל-SignDeal — הפלטפורמה לניהול חוזי תיווך, חתימות דיגיטליות וגביית עמלות.",
    "",
    "כדי להתחיל:",
    "• פתח חוזה ראשון ושלח ללקוח לחתימה",
    "• הוסף לקוחות ונכסים",
    "• עקוב אחר סטטוס כל עסקה בלוח הבקרה",
    "",
    "יש שאלות? אנחנו כאן בכל עת.",
    "",
    "בהצלחה,",
    "צוות SignDeal",
  ].join("\n");

  const html = baseHtml(subject, `
    <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">
      ברוך הבא, ${escHtml(firstName)}! 👋
    </h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
      חשבונך ב-SignDeal נוצר בהצלחה. מעכשיו תוכל לנהל חוזים, לקוחות ותשלומים במקום אחד.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      כדי להתחיל, שלח את החוזה הראשון שלך ללקוח לחתימה דיגיטלית.
    </p>
    ${ctaButton("https://www.signdeal.co.il/dashboard", "כניסה ללוח הבקרה")}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      <strong>מה אפשר לעשות:</strong><br />
      📄 שליחת חוזים לחתימה דיגיטלית<br />
      💳 גביית עמלות מלקוחות<br />
      📊 מעקב אחר כל העסקאות
    </p>
  `);

  return { subject, text, html };
}
