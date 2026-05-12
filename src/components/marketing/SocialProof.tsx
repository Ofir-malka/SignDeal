import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";

/**
 * SocialProof — 3 testimonial cards from Israeli real-estate brokers.
 *
 * Copy is grounded and realistic — no inflated numbers, no generic praise.
 * Each card names a specific workflow pain that SignDeal solves.
 */

const TESTIMONIALS = [
  {
    initials: "ר.ג",
    name:     "רותי גולן",
    city:     "תל אביב",
    role:     "מתווכת עצמאית",
    quote:
      "כבר בשבוע הראשון חתמתי שלושה חוזים בלי לפגוש לקוחות פנים-אל-פנים. " +
      "הלקוח קיבל SMS, חתם תוך עשר דקות, ואני קיבלתי התראה.",
    avatarFrom: "from-violet-500",
    avatarTo:   "to-indigo-500",
  },
  {
    initials: "א.ב",
    name:     "אייל בן-דוד",
    city:     "נתניה",
    role:     "סוכן נדל״ן מוסמך",
    quote:
      "בעבר הוצאתי שעות על ניירת ומרדוף אחרי תשלומים. " +
      "היום אני שולח בקשת תשלום מהמערכת, הלקוח משלם מהנייד, והכסף מגיע. פשוט.",
    avatarFrom: "from-teal-500",
    avatarTo:   "to-emerald-500",
  },
  {
    initials: "ש.מ",
    name:     "שירה מזרחי",
    city:     "ירושלים",
    role:     "מנהלת סניף מקומי",
    quote:
      "מה שעוזר לי הכי הרבה זה שהחוזה כבר מוכן — אני רק ממלאת שם ונכס ושולחת. " +
      "חוסכת שעה לפחות על כל עסקה.",
    avatarFrom: "from-rose-500",
    avatarTo:   "to-pink-500",
  },
] as const;

export function SocialProof() {
  return (
    <SectionWrapper id="testimonials">
      {/* Section header */}
      <div dir="rtl" className="flex flex-col items-center text-center mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>מה אומרים המתווכים</SectionBadge>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2">
            מתווכים שכבר עובדים אחרת
          </h2>
          <p className="text-indigo-200/70 mt-4 max-w-xl mx-auto leading-relaxed">
            אנשי שטח שהחליטו להפסיק לרדוף אחרי חתימות ותשלומים — ומספרים מה השתנה.
          </p>
        </AnimateIn>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, i) => (
          <AnimateIn key={t.name} delay={i * 100} from="bottom">
            <GlassCard
              variant="elevated"
              className="p-6 h-full flex flex-col gap-5 hover:bg-white/[0.13] transition-colors duration-300"
            >
              {/* Decorative open-quote */}
              <span
                className="text-5xl text-violet-400/20 font-serif leading-none select-none"
                aria-hidden="true"
              >
                ״
              </span>

              {/* Quote body */}
              <p
                className="text-sm text-indigo-100/90 leading-relaxed flex-1 text-right"
                dir="rtl"
              >
                {t.quote}
              </p>

              {/* Author row */}
              <div
                className="flex items-center gap-3 pt-3 border-t border-white/10"
                dir="rtl"
              >
                {/* Avatar — gradient circle with initials */}
                <div
                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.avatarFrom} ${t.avatarTo}
                              flex items-center justify-center text-white text-xs font-bold shrink-0`}
                  aria-hidden="true"
                >
                  {t.initials}
                </div>

                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-[11px] text-indigo-300/70">
                    {t.role}&nbsp;·&nbsp;{t.city}
                  </p>
                </div>
              </div>
            </GlassCard>
          </AnimateIn>
        ))}
      </div>
    </SectionWrapper>
  );
}
