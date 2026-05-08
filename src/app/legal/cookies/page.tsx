import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "מדיניות עוגיות",
  description: "מדיניות העוגיות של SignDeal — אילו עוגיות אנו משתמשים בהן וכיצד לנהל אותן.",
  robots:      { index: true, follow: true },
  openGraph: {
    title:       "מדיניות עוגיות | SignDeal",
    description: "מדיניות העוגיות של SignDeal — אילו עוגיות אנו משתמשים בהן וכיצד לנהל אותן.",
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

function CookieTable({
  rows,
}: {
  rows: { name: string; purpose: string; duration: string; type: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 mt-3">
      <table className="w-full text-xs text-right">
        <thead>
          <tr className="bg-gray-50 text-gray-700 border-b border-gray-200">
            <th className="px-4 py-2.5 font-semibold text-right">שם עוגייה</th>
            <th className="px-4 py-2.5 font-semibold text-right">מטרה</th>
            <th className="px-4 py-2.5 font-semibold text-right">משך</th>
            <th className="px-4 py-2.5 font-semibold text-right">סוג</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.name} className="text-gray-600 hover:bg-gray-50">
              <td className="px-4 py-2.5 font-mono text-indigo-700">{r.name}</td>
              <td className="px-4 py-2.5">{r.purpose}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">{r.duration}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">{r.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiesPage() {
  return (
    <article>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">מדיניות עוגיות</h1>
        <p className="text-sm text-gray-400">עודכן לאחרונה: {UPDATED}</p>
      </div>

      <Section title="1. מהן עוגיות (Cookies)?">
        <p>
          עוגיות הן קבצי טקסט קטנים שמאוחסנים בדפדפן שלך כאשר אתה מבקר באתר. הן מאפשרות
          לאתר לזכור מידע על הביקור שלך, כגון שפה מועדפת, מצב כניסה לחשבון, ופרטים נוספים
          שנועדו לשפר את חוויית השימוש.
        </p>
        <p>
          SignDeal משתמשת אך ורק בעוגיות הכרחיות לתפקוד השירות. אנו <strong className="text-gray-800">לא</strong>{" "}
          משתמשים בעוגיות פרסום, מעקב, או אנליטיקה של צד שלישי.
        </p>
      </Section>

      <Section title="2. העוגיות שאנו משתמשים בהן">
        <CookieTable
          rows={[
            {
              name:     "next-auth.session-token",
              purpose:  "שמירת מפתח הסשן המאומת לאחר כניסה לחשבון (HTTP-only, Secure)",
              duration: "30 יום",
              type:     "הכרחית",
            },
            {
              name:     "next-auth.csrf-token",
              purpose:  "הגנה מפני התקפות CSRF בטפסים ובקשות POST",
              duration: "סשן (עד סגירת הדפדפן)",
              type:     "הכרחית",
            },
            {
              name:     "next-auth.callback-url",
              purpose:  "שמירת כתובת ה-redirect לאחר אימות OAuth",
              duration: "סשן",
              type:     "הכרחית",
            },
            {
              name:     "__Secure-next-auth.session-token",
              purpose:  "גרסת HTTPS מאובטחת של עוגיית הסשן (בסביבת ייצור)",
              duration: "30 יום",
              type:     "הכרחית",
            },
          ]}
        />
        <p className="text-xs text-gray-400 mt-2">
          * עוגיות הסשן מסומנות כ-HttpOnly ו-Secure, כלומר אינן נגישות ל-JavaScript ומועברות
          אך ורק בחיבור מוצפן (HTTPS).
        </p>
      </Section>

      <Section title="3. עוגיות שאיננו משתמשים בהן">
        <p>SignDeal לא משתמשת בשום אחת מאלה:</p>
        <ul className="list-disc list-inside space-y-1 mr-3">
          <li>עוגיות פרסום (Google Ads, Facebook Pixel וכד')</li>
          <li>עוגיות אנליטיקה (Google Analytics, Mixpanel וכד')</li>
          <li>עוגיות רשתות חברתיות (Like/Share buttons וכד')</li>
          <li>כל עוגייה מעקב של צד שלישי</li>
        </ul>
      </Section>

      <Section title="4. כיצד לנהל ולמחוק עוגיות">
        <p>
          ניתן לנהל ולמחוק עוגיות דרך הגדרות הדפדפן שלך. שים לב שמחיקת עוגיית הסשן תדרוש
          ממך להיכנס מחדש לחשבון.
        </p>
        <ul className="list-disc list-inside space-y-1.5 mr-3">
          <li>
            <strong className="text-gray-800">Chrome:</strong>{" "}
            הגדרות ← פרטיות ואבטחה ← עוגיות ונתוני אתר אחרים
          </li>
          <li>
            <strong className="text-gray-800">Firefox:</strong>{" "}
            הגדרות ← פרטיות ואבטחה ← עוגיות ונתוני אתר
          </li>
          <li>
            <strong className="text-gray-800">Safari:</strong>{" "}
            העדפות ← פרטיות ← נהל נתוני אתר
          </li>
        </ul>
        <p>
          מכיוון שאנו משתמשים בעוגיות הכרחיות בלבד, חסימת עוגיות עלולה לפגוע בתפקוד השירות.
        </p>
      </Section>

      <Section title="5. עדכונים למדיניות זו">
        <p>
          אנו עשויים לעדכן מדיניות זו בעקבות שינויים טכניים בשירות. עדכונים מהותיים יפורסמו
          בדף זה עם תאריך הכניסה לתוקף.
        </p>
      </Section>

      <Section title="6. יצירת קשר">
        <p>
          לשאלות הנוגעות למדיניות עוגיות זו:{" "}
          <a href="mailto:support@signdeal.co.il" className="text-indigo-600 hover:text-indigo-700 font-medium">
            support@signdeal.co.il
          </a>
        </p>
      </Section>
    </article>
  );
}
