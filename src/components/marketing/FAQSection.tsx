"use client";

import { useState } from "react";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * FAQ accordion — keyboard-accessible, smooth height animation.
 * id="faq" matches the #faq anchor in NavBar.
 *
 * Animation technique: CSS grid-rows-[0fr → 1fr] avoids the need to
 * know content height at render time, unlike max-height tricks.
 * Fully SSR-safe — initial state (all collapsed) renders correctly
 * without JS.
 */

const FAQS = [
  {
    q: "האם החוזים תקפים משפטית בישראל?",
    a: "כן. תבניות החוזים של SignDeal נבנו בהתאם לדרישות חוק המתווכים במקרקעין (תשנ\"ו-1996) וכוללות את כל הסעיפים הנדרשים על-פי חוק: זיהוי הצדדים, פרטי הנכס, שיעור העמלה ותנאי ההתקשרות. החוזה החתום בפלטפורמה מחייב משפטית בדיוק כמו חוזה ידני.",
  },
  {
    q: "האם חתימה דיגיטלית על חוזה תיווך חוקית בישראל?",
    a: "כן. חוק חתימה אלקטרונית (2001) מכיר בחתימות דיגיטליות ובית המשפט העליון אישר את תוקפן. חוזי תיווך נחתמים דיגיטלית בישראל מדי יום ועומדים בדרישות חוק המתווכים במקרקעין.",
  },
  {
    q: "כמה זמן לוקח להתחיל לעבוד עם SignDeal?",
    a: "פחות מ-10 דקות. נרשמים, מגדירים את הפרטים שלכם, בוחרים תבנית חוזה ושולחים את החוזה הראשון ללקוח. אין התקנות, אין הגדרות מסובכות.",
  },
  {
    q: "האם הלקוח שלי צריך להתקין אפליקציה או להירשם?",
    a: "לא. הלקוח מקבל SMS עם לינק, פותח בדפדפן הרגיל שלו, קורא את החוזה וחותם עם האצבע. ללא הורדות, ללא הרשמה, ללא סיסמאות.",
  },
  {
    q: "איך עובד תהליך התשלום? לאן הכסף עובר?",
    a: "אנחנו עובדים עם Rapyd, פלטפורמת תשלומים מורשית ומפוקחת. הלקוח משלם בכרטיס אשראי דרך לינק מאובטח. הכסף עובר ישירות לחשבון שלכם בניכוי עמלת הפלטפורמה.",
  },
  {
    q: "האם התשלומים מאובטחים?",
    a: "כן. כל עסקאות התשלום מטופלות על-ידי Rapyd — גוף פיננסי מורשה ומפוקח על-ידי בנק ישראל. פרטי הכרטיס לא עוברים דרך השרתים שלנו בשום שלב. החיבור מוצפן ב-TLS והפלטפורמה עומדת בתקן PCI-DSS לאבטחת נתוני תשלום.",
  },
  {
    q: "האם הנתונים שלי מאובטחים?",
    a: "כן. כל הנתונים מוצפנים בתעבורה (TLS) ובאחסון. השרתים נמצאים באירופה (AWS EU). אנחנו עומדים בתקנות הגנת הפרטיות הישראליות ובתקנות ה-GDPR.",
  },
  {
    q: "מה ההבדל בין תכנית Starter לתכנית Pro?",
    a: "Starter מיועד לסוכן שרוצה לנסות — עד 3 חוזים פעילים עם חתימה דיגיטלית ולוח בקרה בסיסי. Pro מסיר את כל המגבלות ומוסיף תזכורות אוטומטיות, בקשות תשלום, ניהול לקוחות מלא ותמיכה בעדיפות.",
  },
  {
    q: "האם ניתן לבטל את המנוי בכל עת?",
    a: "כן. ביטול בלחיצה אחת, ללא קנסות ללא תקופות מחייבות. אם שילמתם מנוי שנתי ומבטלים לפני תום השנה, תקבלו החזר יחסי על החודשים שנותרו.",
  },
  {
    q: "האם יש תקופת ניסיון לתכנית Pro?",
    a: "כן. 14 יום ניסיון מלא ללא תשלום, ולא נדרש כרטיס אשראי. תוכלו לנסות את כל הפיצ'רים של Pro ולהחליט בסוף הניסיון אם להמשיך.",
  },
] as const;

/* ── Single FAQ item ── */
function FAQItem({
  question,
  answer,
  index,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelId  = `faq-panel-${index}`;
  const buttonId = `faq-btn-${index}`;

  return (
    <div className="border-b border-white/10 last:border-b-0">
      {/* Question — button */}
      <h3>
        <button
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className={[
            "w-full flex items-center justify-between gap-4 py-5 text-right",
            "text-white font-medium text-base leading-snug",
            "hover:text-indigo-200 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg",
          ].join(" ")}
          dir="rtl"
        >
          <span className="flex-1">{question}</span>

          {/* Chevron — rotates when open */}
          <svg
            className={[
              "shrink-0 text-violet-400 transition-transform duration-300",
              isOpen ? "rotate-180" : "rotate-0",
            ].join(" ")}
            width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </h3>

      {/*
        Answer panel — CSS grid-rows animation.
        grid-rows-[0fr] collapses to zero height; grid-rows-[1fr] expands to
        natural height. The inner div with overflow-hidden is required for the
        trick to work (content must be in a single child).
      */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={[
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <p
            dir="rtl"
            className="text-indigo-200/75 text-sm leading-relaxed pb-5 text-right"
          >
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Section ── */
export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) =>
    setOpenIndex((prev) => (prev === i ? null : i));

  return (
    <SectionWrapper id="faq" className="bg-indigo-900/20">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-12">
        <AnimateIn delay={0}>
          <SectionBadge>שאלות נפוצות</SectionBadge>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            יש לכם שאלות? יש לנו תשובות.
          </h2>
        </AnimateIn>
      </div>

      {/* ── Accordion ─────────────────────────────────────────────────── */}
      <AnimateIn delay={120}>
        <div className="max-w-2xl mx-auto">
          <div
            className="bg-white/5 border border-white/10 rounded-2xl px-6 sm:px-8"
          >
            {FAQS.map(({ q, a }, i) => (
              <FAQItem
                key={i}
                question={q}
                answer={a}
                index={i}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        </div>
      </AnimateIn>
    </SectionWrapper>
  );
}
