import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * LegalTrustSection — trust and security signals for Israeli real estate brokers.
 *
 * Wording policy:
 *   • "מיועד להתאים לתהליכי עבודה של מתווכים" — not "מאושר משפטית"
 *   • "ספק תשלומים מורשה ומפוקח" — not "PCI-certified" (technically true but
 *     phrased to avoid implying SignDeal itself holds the certification)
 *   • "תהליך תואם חוק החתימה האלקטרונית" — factual, not aspirational
 *   • "שמירת תיעוד לכל פעולה" — describes what the system does, not legal guarantees
 *
 * No exaggerated claims. Every statement describes product behaviour, not legal opinions.
 */

// ─── Trust feature cards ──────────────────────────────────────────────────────

const TRUST_CARDS = [
  {
    title: "נבנה לסוכני נדל״ן בישראל",
    body:  "SignDeal מיועד לתהליכי העבודה הספציפיים של מתווכי נדל״ן — החתמת מתעניינים, בלעדיות, ושיתוף פעולה בין מתווכים.",
    accent: "text-violet-400",
    border: "border-violet-400/20",
    glow:   "bg-violet-400/[0.04]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    title: "תהליך חתימה תואם חוק",
    body:  "תהליך החתימה מיועד להתאים לחוק החתימה האלקטרונית (2001). כל חתימה נרשמת עם חותמת זמן וכתובת IP לצורך תיעוד.",
    accent: "text-blue-400",
    border: "border-blue-400/20",
    glow:   "bg-blue-400/[0.04]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    title: "תבניות מותאמות לתיווך",
    body:  "תבניות החוזים כוללות את הסעיפים המקובלים בעולם התיווך הישראלי: זיהוי, פרטי נכס, עמלה, בלעדיות ותנאי ביטול.",
    accent: "text-indigo-400",
    border: "border-indigo-400/20",
    glow:   "bg-indigo-400/[0.04]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    title: "תשלומים דרך ספק מורשה",
    body:  "עסקאות התשלום מתבצעות דרך Rapyd — ספק תשלומים מפוקח ומורשה. פרטי כרטיס האשראי מוצפנים ואינם עוברים דרך שרתי SignDeal.",
    accent: "text-emerald-400",
    border: "border-emerald-400/20",
    glow:   "bg-emerald-400/[0.04]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: "תיעוד מסודר לכל פעולה",
    body:  "כל שליחה, פתיחה, חתימה ותשלום נרשמים אוטומטית. תמיד תוכלו לדעת מי קרא, מי חתם ומי שילם — ומתי בדיוק.",
    accent: "text-amber-400",
    border: "border-amber-400/20",
    glow:   "bg-amber-400/[0.04]",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
] as const;

// ─── Security / compliance strip ──────────────────────────────────────────────

const SECURITY_SIGNALS = [
  {
    label: "תשלום מאובטח",
    sub:   "ספק מפוקח על-ידי בנק ישראל",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: "תיעוד חתימה",
    sub:   "חותמת זמן וכתובת IP לכל חתימה",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "מעקב SMS ו-Email",
    sub:   "תיעוד כל שליחה, פתיחה וקריאה",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "שמירת PDF",
    sub:   "מסמך חוזה מלא ניתן להורדה",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
] as const;

// ─── Exported section ─────────────────────────────────────────────────────────

export function LegalTrustSection() {
  return (
    <SectionWrapper id="trust" className="border-t border-white/10">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>אמינות ואבטחה</SectionBadge>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2 max-w-2xl mx-auto">
            נבנה לאופן העבודה של
            <br className="hidden sm:block" />
            מתווכי נדל״ן בישראל
          </h2>
          <p className="text-indigo-200/65 mt-4 max-w-xl mx-auto text-base leading-relaxed">
            SignDeal מיועד להתאים לתהליכי העבודה של מתווכים ישראלים —
            מחוזה ועד גביית עמלה, עם תיעוד מסודר בכל שלב.
          </p>
        </AnimateIn>
      </div>

      {/* ── Trust cards: 2+3 grid ───────────────────────────────────────── */}
      {/*
        2 cards on first row (md), 3 on second row (md:col-span-1 each).
        On mobile: all 5 stack vertically.
        Implementation: 6-column grid where first 2 cards span 3 cols each,
        and last 3 cards span 2 cols each.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TRUST_CARDS.map((card, i) => (
          <AnimateIn key={card.title} delay={i * 70} from="bottom">
            <GlassCard
              className={[
                "p-6 flex gap-4 items-start h-full border transition-colors duration-300",
                card.border,
                card.glow,
                "hover:border-white/20",
              ].join(" ")}
            >
              {/* Icon chip */}
              <div
                className={[
                  "shrink-0 mt-0.5 p-2.5 rounded-xl bg-white/5 border border-white/10",
                  card.accent,
                ].join(" ")}
                aria-hidden="true"
              >
                {card.icon}
              </div>

              {/* Text */}
              <div dir="rtl" className="text-right flex-1">
                <h3 className="text-white font-semibold text-sm mb-1.5 leading-snug">
                  {card.title}
                </h3>
                <p className="text-indigo-200/65 text-sm leading-relaxed">
                  {card.body}
                </p>
              </div>
            </GlassCard>
          </AnimateIn>
        ))}
      </div>

      {/* ── Security / compliance strip ─────────────────────────────────── */}
      <AnimateIn delay={100}>
        <div
          dir="rtl"
          className="mt-8 rounded-2xl bg-white/[0.03] border border-white/8
                     grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-white/8"
        >
          {SECURITY_SIGNALS.map(({ label, sub, icon }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center gap-2.5 px-5 py-5"
            >
              <span className="text-violet-400">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-[11px] text-indigo-400/65 mt-0.5 leading-snug">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </AnimateIn>

      {/* ── Disclaimer ──────────────────────────────────────────────────── */}
      <AnimateIn delay={60}>
        <p
          dir="rtl"
          className="text-center text-xs text-indigo-400/40 mt-6 max-w-xl mx-auto leading-relaxed"
        >
          SignDeal היא פלטפורמת עבודה לסוכני נדל״ן ואינה מהווה ייעוץ משפטי.
          לכל שאלה משפטית פנו לעו״ד מוסמך.
        </p>
      </AnimateIn>

    </SectionWrapper>
  );
}
