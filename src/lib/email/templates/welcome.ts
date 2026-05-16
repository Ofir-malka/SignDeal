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
    "הצעד הבא: הוסף אמצעי תשלום כדי להפעיל את ניסיון החינם שלך (14 יום).",
    "לא יחויב היום — הניסיון מתחיל רק לאחר אישור הכרטיס.",
    "",
    "כדי להוסיף אמצעי תשלום:",
    "1. לחץ על הכפתור למטה",
    "2. בחר מסלול (ניתן לשנות בכל עת)",
    "3. הזן פרטי כרטיס — לא יחויב היום",
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
      חשבונך ב-SignDeal נוצר בהצלחה.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      <strong>הצעד הבא:</strong> הוסף אמצעי תשלום כדי להפעיל את ניסיון החינם שלך ל-14 יום.
      לא יחויב היום — הניסיון מתחיל רק לאחר אישור הכרטיס, וניתן לבטל בכל עת.
    </p>
    ${ctaButton("https://www.signdeal.co.il/onboarding/billing", "התחל ניסיון חינם")}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      <strong>מה מחכה לך אחרי הניסיון:</strong><br />
      📄 שליחת חוזים לחתימה דיגיטלית<br />
      💳 גביית עמלות מלקוחות<br />
      📊 מעקב אחר כל העסקאות
    </p>
  `);

  return { subject, text, html };
}
