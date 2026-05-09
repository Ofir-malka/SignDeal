import { SectionWrapper }  from "@/components/marketing/ui/SectionWrapper";
import { GlassCard }       from "@/components/marketing/ui/GlassCard";
import { SectionBadge }    from "@/components/marketing/ui/SectionBadge";
import { AnimateIn }       from "@/components/marketing/ui/AnimateIn";

/**
 * Problem section — gives Israeli brokers language for their daily frustrations
 * before presenting SignDeal as the solution.
 *
 * Pain cards use amber/red accents to signal urgency.
 * No CTAs here — let the reader feel the problem first.
 */

const PAIN_POINTS = [
  {
    title: "PDF בוואטסאפ",
    body:  "שלחתם חוזה, לא יודעים אם נפתח. לא חזר חתום. לא זוכרים למי שלחתם ומתי.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="15" x2="15" y2="15" />
        <line x1="9" y1="11" x2="15" y2="11" />
      </svg>
    ),
    accent: "text-amber-400",
    border: "border-amber-400/20",
    glow:   "bg-amber-400/5",
  },
  {
    title: "מרדף אחרי עמלות",
    body:  "שוכחים מי שילם ומי לא. מביך לבקש שוב. חלק מהלקוחות פשוט מתחמקים.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    accent: "text-red-400",
    border: "border-red-400/20",
    glow:   "bg-red-400/5",
  },
  {
    title: "אקסל ופתקים",
    body:  "מנהלים עסקאות בגיליון אקסל, ב-WhatsApp ובפתקים. אין תמונה אחת של מה שקורה.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3"  y1="9"  x2="21" y2="9"  />
        <line x1="3"  y1="15" x2="21" y2="15" />
        <line x1="9"  y1="3"  x2="9"  y2="21" />
        <line x1="15" y1="3"  x2="15" y2="21" />
      </svg>
    ),
    accent: "text-orange-400",
    border: "border-orange-400/20",
    glow:   "bg-orange-400/5",
  },
  {
    title: "תזכורות ידניות",
    body:  "שולחים הודעות אחת אחת בכל עסקה. לא זוכרים למי שלחו. לא יודעים אם קראו.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <line x1="12" y1="2" x2="12" y2="4" />
      </svg>
    ),
    accent: "text-amber-400",
    border: "border-amber-400/20",
    glow:   "bg-amber-400/5",
  },
] as const;

export function ProblemSection() {
  return (
    <SectionWrapper>
      <div dir="rtl" className="flex flex-col items-center text-center gap-4 mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>הבעיה</SectionBadge>
        </AnimateIn>

        <AnimateIn delay={80}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight max-w-2xl">
            הסוכן הישראלי מבזבז שעות על ניירת
          </h2>
        </AnimateIn>

        <AnimateIn delay={160}>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-xl">
            כשאתם אמורים להיות בשטח, אתם מוצאים את עצמכם
            מחפשים PDF, מרדפים אחרי חתימות ומתקשרים לגבות עמלות.
          </p>
        </AnimateIn>
      </div>

      {/* Pain cards */}
      <div
        dir="rtl"
        className="grid grid-cols-1 sm:grid-cols-2 gap-5"
      >
        {PAIN_POINTS.map(({ title, body, icon, accent, border, glow }, i) => (
          <AnimateIn key={title} delay={i * 80} from="bottom">
            <GlassCard
              className={[
                "p-6 flex gap-5 items-start h-full border",
                border,
                glow,
                "hover:border-white/20 transition-colors duration-300",
              ].join(" ")}
            >
              {/* Icon */}
              <div
                className={[
                  "shrink-0 mt-0.5 p-2.5 rounded-xl bg-white/5 border border-white/10",
                  accent,
                ].join(" ")}
              >
                {icon}
              </div>

              {/* Text */}
              <div className="text-right">
                <h3 className="text-white font-semibold text-base mb-1.5">
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
