import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "מדיניות פרטיות",
  description: "מדיניות הפרטיות של SignDeal — כיצד אנו אוספים, משתמשים ומגינים על המידע שלך.",
  robots:      { index: true, follow: true },
  openGraph: {
    title:       "מדיניות פרטיות | SignDeal",
    description: "מדיניות הפרטיות של SignDeal — כיצד אנו אוספים, משתמשים ומגינים על המידע שלך.",
  },
};

const UPDATED = "1 בינואר 2025";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">{title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <article>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">מדיניות פרטיות</h1>
        <p className="text-sm text-gray-400">עודכן לאחרונה: {UPDATED}</p>
      </div>

      <Section title="1. מי אנחנו">
        <p>
          SignDeal ("אנחנו", "השירות") מפעילה פלטפורמת CRM לסוכני נדל"ן בישראל. מדיניות זו
          מסבירה אילו נתונים אנו אוספים, כיצד אנו משתמשים בהם, ומהן זכויותיך לפי חוק הגנת
          הפרטיות, התשמ"א-1981 ותיקוניו.
        </p>
      </Section>

      <Section title="2. המידע שאנו אוספים">
        <p>
          <strong className="text-gray-800">א. מידע שמוסר על ידי הסוכן (משתמש רשום):</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 mr-3">
          <li>שם מלא, כתובת דוא"ל, מספר טלפון</li>
          <li>מספר רישיון תיווך ומספר תעודת זהות — לצרכי אימות זהות בלבד</li>
          <li>לוגו להצגה בחוזים (URL חיצוני, לא מאוחסן אצלנו)</li>
        </ul>
        <p>
          <strong className="text-gray-800">ב. מידע על לקוחות הסוכן (צדדים לחוזה):</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 mr-3">
          <li>שם הלקוח ומספר טלפון — כפי שמוזנים על ידי הסוכן</li>
          <li>כתובת נכס, סוג עסקה ומחיר — כנדרש לחוזה</li>
          <li>נתוני חתימה גרפית (תמונת חתימה בפורמט base64, מוצפנת)</li>
          <li>כתובת IP מקוצרת (\*.x.x.x) וחותמת זמן של החתימה — לצרכי ביקורת חוזית</li>
        </ul>
        <p>
          <strong className="text-gray-800">ג. נתוני שימוש אוטומטיים:</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 mr-3">
          <li>לוגים של בקשות API (לצרכי אבטחה ואיתור תקלות)</li>
          <li>cookie לניהול סשן מאומת (ראה מדיניות עוגיות)</li>
        </ul>
      </Section>

      <Section title="3. כיצד אנו משתמשים במידע">
        <ul className="list-disc list-inside space-y-1.5 mr-3">
          <li>ניהול חשבון הסוכן ואמינות גישה</li>
          <li>יצירה ושמירת חוזי תיווך בחשבונך</li>
          <li>שליחת קישורי חתימה ותזכורות ללקוחות (SMS / WhatsApp)</li>
          <li>עיבוד ותיעוד בקשות תשלום</li>
          <li>שמירת רשומת ביקורת לכל חתימה לצרכים משפטיים</li>
          <li>שיפור השירות, אבטחה, ומניעת שימוש לרעה</li>
        </ul>
        <p>
          אנו <strong className="text-gray-800">לא</strong> מוכרים, מחכירים, או משתפים את
          מידעך לצרכי פרסום.
        </p>
      </Section>

      <Section title="4. שיתוף מידע עם צדדים שלישיים">
        <p>
          אנו משתפים מידע מינימלי עם ספקים אלה, אך ורק לצורך מתן השירות:
        </p>
        <ul className="list-disc list-inside space-y-1.5 mr-3">
          <li>
            <strong className="text-gray-800">Infobip</strong> — ספק שליחת SMS. מספר הטלפון
            ותוכן ההודעה מועברים לצורך שליחת החתימה / תזכורת / בקשת תשלום.
            {" "}<a href="https://www.infobip.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">מדיניות פרטיות Infobip</a>
          </li>
          <li>
            <strong className="text-gray-800">ספק תשלומים</strong> — לעיבוד תשלומי עמלה.
            פרטי כרטיס אשראי אינם עוברים דרך שרתינו ואינם נשמרים אצלנו.
          </li>
          <li>
            <strong className="text-gray-800">ספק אחסון ענן (PostgreSQL)</strong> — כל נתוני
            החשבון והחוזים מאוחסנים בשרתים מאובטחים באיחוד האירופי (EU-West).
          </li>
        </ul>
        <p>
          מידע עשוי להיחשף גם מכוח דין, צו שיפוטי, או לצורך הגנה על זכויות SignDeal.
        </p>
      </Section>

      <Section title="5. שמירת מידע">
        <ul className="list-disc list-inside space-y-1.5 mr-3">
          <li>נתוני חשבון: נשמרים כל עוד החשבון פעיל ועד 3 שנים לאחר סגירתו</li>
          <li>חוזים ורשומות ביקורת חתימה: נשמרים 7 שנים בהתאם לדרישות חוק חשבונאות ישראלי</li>
          <li>לוגים טכניים: נמחקים לאחר 90 יום</li>
          <li>רשומות הודעות SMS: נשמרות 12 חודשים לצרכי ביקורת</li>
        </ul>
        <p>
          לאחר פרישת תקופת השמירה, הנתונים נמחקים בצורה מאובטחת או מוגדרות אנונימיים.
        </p>
      </Section>

      <Section title="6. זכויותיך">
        <p>לפי חוק הגנת הפרטיות, התשמ"א-1981, יש לך הזכות:</p>
        <ul className="list-disc list-inside space-y-1 mr-3">
          <li>לעיין במידע שנאסף עליך</li>
          <li>לתקן מידע שגוי</li>
          <li>לבקש מחיקת חשבונך (בכפוף לחובות שמירה חוקיות)</li>
          <li>לבקש העברת נתונים בפורמט מובנה (data portability)</li>
        </ul>
        <p>
          לממוש זכויות אלה, שלח בקשה בכתב ל:{" "}
          <a href="mailto:privacy@signdeal.co.il" className="text-indigo-600 hover:text-indigo-700 font-medium">
            privacy@signdeal.co.il
          </a>
        </p>
      </Section>

      <Section title="7. אבטחת מידע">
        <p>
          אנו נוקטים אמצעי אבטחה סבירים ומקובלים בתעשייה: הצפנת תעבורה (TLS 1.3), גיבויים
          יומיים מוצפנים, בקרת גישה מבוססת תפקידים, ורישום ביקורת של כל הגישות למידע רגיש.
        </p>
        <p>
          ביקשנו מספקינו עמידה בתקן SOC 2 ו/או ISO 27001. בכל מקרה של פרצת אבטחה מהותית
          נודיע לך בתוך 72 שעות בהתאם לדרישות הדין.
        </p>
      </Section>

      <Section title="8. יצירת קשר בנושא פרטיות">
        <p>
          לשאלות, בקשות, או תלונות הנוגעות לפרטיות, פנה אל:
        </p>
        <p>
          <a href="mailto:privacy@signdeal.co.il" className="text-indigo-600 hover:text-indigo-700 font-medium">
            privacy@signdeal.co.il
          </a>
        </p>
        <p>
          נשתדל להשיב לכל פנייה בתוך 14 ימי עבודה.
        </p>
      </Section>
    </article>
  );
}
