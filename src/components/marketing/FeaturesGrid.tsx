import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * Solution overview — 6 feature cards showing what SignDeal does.
 * Acts as the direct answer to ProblemSection.
 *
 * id="features" matches the #features anchor in NavBar.
 */

const FEATURES = [
  {
    title: "חוזים דיגיטליים",
    body:  "תבניות חוזי תיווך מוכנות. מלאו פרטי נכס, לקוח ועמלה — החוזה נוצר אוטומטית.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: "חתימה אלקטרונית",
    body:  "לינק חתימה ייחודי נשלח ללקוח ב-SMS. הוא חותם מהנייד — בלי הורדות, בלי הרשמה.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    title: "בקשות תשלום",
    body:  "שלחו לינק תשלום מאובטח ישירות מהחוזה. הכסף מועבר לחשבונכם אוטומטית.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    title: "תזכורות אוטומטיות",
    body:  "SMS ו-WhatsApp אוטומטיים לכל לקוח עד לחתימה ולגבייה. בלי מעקב ידני.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    title: "לוח בקרה חכם",
    body:  "ראו מה חתום, מה ממתין, מה שולם — הכל בשנייה. ללא דוחות, ללא ניחושים.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4"  />
        <line x1="6"  y1="20" x2="6"  y2="14" />
      </svg>
    ),
  },
  {
    title: "ניהול לקוחות",
    body:  "היסטוריית עסקאות, חוזים ותשלומים לפי לקוח. כל מה שצריך — במקום אחד.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
] as const;

export function FeaturesGrid() {
  return (
    <SectionWrapper id="features">
      {/* Section header */}
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>הפתרון</SectionBadge>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight max-w-2xl">
            כל מה שסוכן נדל״ן צריך — במקום אחד
          </h2>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-xl">
            מהחוזה הראשון ועד קבלת הכסף — SignDeal מנהל הכל,
            כדי שתוכלו להתרכז בסגירת עסקאות.
          </p>
        </AnimateIn>
      </div>

      {/* Feature cards */}
      <div
        dir="rtl"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {FEATURES.map(({ title, body, icon }, i) => (
          <AnimateIn key={title} delay={i * 60} from="bottom">
            <GlassCard
              className="p-6 flex flex-col gap-4 h-full
                         hover:border-white/25 hover:bg-white/8
                         transition-all duration-300 group"
            >
              {/* Icon chip */}
              <div className="self-start p-2.5 rounded-xl bg-violet-500/15 border border-violet-400/25 text-violet-400 group-hover:bg-violet-500/25 transition-colors duration-300">
                {icon}
              </div>

              {/* Text */}
              <div className="text-right">
                <h3 className="text-white font-semibold text-base mb-2">
                  {title}
                </h3>
                <p className="text-indigo-200/70 text-sm leading-relaxed">
                  {body}
                </p>
              </div>
            </GlassCard>
          </AnimateIn>
        ))}
      </div>
    </SectionWrapper>
  );
}
