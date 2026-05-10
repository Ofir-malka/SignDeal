import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * How It Works — 3 sequential steps.
 * id="how" matches the #how anchor in NavBar.
 *
 * Desktop: 3-column grid with a horizontal connector line behind the circles.
 * Mobile:  single column, numbered steps stacked vertically.
 *
 * Connector technique: absolute h-px element + circles rendered with
 * bg-indigo-950 (same as page bg) at z-10, so the line appears only
 * in the gaps between circles without visual overlap.
 */

const STEPS = [
  {
    num:   "01",
    title: "צרו חוזה",
    body:  "בחרו תבנית, מלאו שם לקוח, נכס ועמלה. החוזה מוכן לשליחה תוך שתי דקות.",
    icon:  (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    num:   "02",
    title: "שלחו לחתימה",
    body:  "לינק אישי נשלח ללקוח ב-SMS. הוא חותם מהנייד בלי אפליקציה ובלי הרשמה.",
    icon:  (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    num:   "03",
    title: "גבו ועקבו",
    body:  "שלחו בקשת תשלום. קבלו התראה כשמשולם. הכל נרשם אוטומטית בלוח הבקרה.",
    icon:  (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <SectionWrapper id="how" className="bg-indigo-900/20">
      {/* ── Section header ─────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-16">
        <AnimateIn delay={0}>
          <SectionBadge>איך זה עובד</SectionBadge>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
            סגרו עסקה בשלושה צעדים
          </h2>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-xl">
            מהחוזה הראשון ועד קבלת הכסף — פחות מ-10 דקות להתחיל.
          </p>
        </AnimateIn>
      </div>

      {/* ── Steps grid ─────────────────────────────────────────────────── */}
      <div dir="rtl" className="relative">

        {/*
          Connector line — desktop only.
          Rendered behind circles (z-0); circles use bg-indigo-950 at z-10
          so the line appears only in the gaps between them.
          left-[20%]/right-[20%] ≈ the inner edges of the outer circles
          in a 3-col equal grid.
        */}
        <div
          aria-hidden="true"
          className="hidden md:block absolute top-7 left-[20%] right-[20%] h-px bg-white/15"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6">
          {STEPS.map(({ num, title, body, icon }, i) => (
            <AnimateIn key={num} delay={i * 130} from="bottom">
              <div className="flex flex-col items-center text-center gap-5">

                {/* Step circle — bg-indigo-950 masks the connector line */}
                <div className="relative z-10 flex flex-col items-center gap-1.5">
                  <div
                    className="w-14 h-14 rounded-full
                               bg-indigo-950 border-2 border-violet-400/50
                               flex items-center justify-center
                               shadow-lg shadow-violet-500/10"
                  >
                    <span className="text-violet-300 font-bold text-lg leading-none">
                      {num}
                    </span>
                  </div>
                </div>

                {/* Step icon + text */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-violet-400/70">{icon}</div>

                  <div>
                    <h3 className="text-white font-bold text-xl mb-2">
                      {title}
                    </h3>
                    <p className="text-indigo-200/70 text-sm leading-relaxed max-w-xs mx-auto">
                      {body}
                    </p>
                  </div>
                </div>

              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
