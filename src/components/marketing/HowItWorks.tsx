import Link from "next/link";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * HowItWorks — 3 sequential steps.
 * id="how" matches the #how anchor in NavBar.
 *
 * Layout:
 *   Mobile  : single column, numbered step cards stacked vertically.
 *   Desktop : 3-column grid with a horizontal connector line behind the step badges.
 *
 * Connector technique:
 *   An absolute h-px element sits at the vertical midpoint of the badge circle.
 *   The badges render at z-10 with a solid-fill background that masks the line
 *   in the badge area, making the line appear only in the gaps between circles.
 *   The GlassCard content sits below the badge, connected visually.
 */

const STEPS = [
  {
    num:    "01",
    title:  "צרו חוזה תוך 3 דקות",
    body:   "בחרו תבנית מאושרת, מלאו שם לקוח, כתובת נכס ועמלה — החוזה נוצר אוטומטית ומוכן לשליחה.",
    detail: "תבניות להחתמת מתעניין, בעל נכס ושיתוף מתווכים",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    accentFrom: "from-violet-500",
    accentTo:   "to-indigo-500",
    accentText: "text-violet-300",
    accentBorder: "border-violet-400/40",
    accentGlow:   "bg-violet-500/10",
  },
  {
    num:    "02",
    title:  "הלקוח חותם מהנייד",
    body:   "לינק חתימה ייחודי נשלח ב-SMS. הלקוח פותח בדפדפן, קורא, וחותם עם האצבע — ללא אפליקציה, ללא הרשמה.",
    detail: "אתם מקבלים התראה ברגע החתימה",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    accentFrom: "from-blue-500",
    accentTo:   "to-violet-500",
    accentText: "text-blue-300",
    accentBorder: "border-blue-400/40",
    accentGlow:   "bg-blue-500/10",
  },
  {
    num:    "03",
    title:  "גבו עמלה — בלי מרדוף",
    body:   "שלחו בקשת תשלום בלחיצה אחת. הלקוח משלם בכרטיס אשראי מהנייד. הכסף מגיע אליכם ישירות — הכל מתועד.",
    detail: "אישור תשלום אוטומטי לשני הצדדים",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    accentFrom: "from-emerald-500",
    accentTo:   "to-teal-500",
    accentText: "text-emerald-300",
    accentBorder: "border-emerald-400/40",
    accentGlow:   "bg-emerald-500/10",
  },
] as const;

export function HowItWorks() {
  return (
    <SectionWrapper id="how" className="bg-indigo-900/20">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-16">
        <AnimateIn delay={0}>
          <SectionBadge>איך זה עובד</SectionBadge>
        </AnimateIn>
        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            מחוזה לתשלום — שלושה צעדים
          </h2>
        </AnimateIn>
        <AnimateIn delay={160}>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-xl">
            פחות מ-10 דקות מהחוזה הראשון עד קבלת הכסף. ממש.
          </p>
        </AnimateIn>
      </div>

      {/* ── Steps grid ──────────────────────────────────────────────────── */}
      <div dir="rtl" className="relative">

        {/*
          Connector line — desktop only (md+).
          Sits at top-7 (vertical centre of the 56px = 14 × 4 = 3.5rem badge circle).
          left-[17%]/right-[17%] roughly aligns with the inner edges of the outer circles
          in a 3-equal-col grid, so the line appears only in the gaps.
        */}
        <div
          aria-hidden="true"
          className="hidden md:block absolute top-7 left-[17%] right-[17%]"
        >
          {/* Gradient line — fades from violet to emerald to match step accents */}
          <div className="h-px bg-gradient-to-l from-emerald-400/30 via-blue-400/30 to-violet-400/30" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {STEPS.map(({ num, title, body, detail, icon, accentFrom, accentTo, accentText, accentBorder, accentGlow }, i) => (
            <AnimateIn key={num} delay={i * 130} from="bottom">
              <div className="flex flex-col items-center gap-0">

                {/* ── Step badge — z-10 masks the connector line ─────── */}
                <div className="relative z-10 flex flex-col items-center mb-5">
                  <div
                    className={[
                      "w-14 h-14 rounded-full flex items-center justify-center",
                      "bg-gradient-to-br shadow-lg",
                      `${accentFrom} ${accentTo}`,
                    ].join(" ")}
                    style={{ boxShadow: "0 0 0 4px rgb(30 27 75), 0 0 0 6px rgba(167,139,250,0.2)" }}
                  >
                    <span className="text-white font-black text-lg leading-none">{num}</span>
                  </div>
                </div>

                {/* ── Step card ──────────────────────────────────────── */}
                <GlassCard
                  variant="elevated"
                  className={[
                    "w-full p-6 flex flex-col items-center text-center gap-4",
                    `border ${accentBorder} ${accentGlow}`,
                    "hover:border-white/25 transition-colors duration-300",
                  ].join(" ")}
                >
                  {/* Icon */}
                  <div className={accentText}>{icon}</div>

                  {/* Title */}
                  <h3 className="text-white font-bold text-xl leading-snug">
                    {title}
                  </h3>

                  {/* Body */}
                  <p className="text-indigo-200/75 text-sm leading-relaxed">
                    {body}
                  </p>

                  {/* Detail chip */}
                  <div
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                      "bg-white/5 border border-white/10 text-xs",
                      accentText,
                    ].join(" ")}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {detail}
                  </div>
                </GlassCard>

              </div>
            </AnimateIn>
          ))}
        </div>
      </div>

      {/* ── Micro CTA ───────────────────────────────────────────────────── */}
      <AnimateIn delay={200}>
        <div dir="rtl" className="flex justify-center mt-14">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/20
                       text-white text-sm font-medium px-7 py-3 rounded-xl
                       hover:bg-white/15 active:scale-[0.98] transition-all"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              className="rotate-180"
            >
              <polyline points="9 18 3 12 9 6" />
            </svg>
            התחל חינם עכשיו
          </Link>
        </div>
      </AnimateIn>

    </SectionWrapper>
  );
}
