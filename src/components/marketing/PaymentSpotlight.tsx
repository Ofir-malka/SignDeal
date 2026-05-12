import Link from "next/link";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";

/**
 * PaymentSpotlight — dedicated conversion section about brokerage fee collection.
 *
 * Hook: "עמלה שנחתמה היא לא עמלה שנגבתה — עד עכשיו"
 *
 * Layout: text column (right) + payment flow mock (left), RTL.
 * Mock is a GlassCard timeline showing the 4-step payment journey.
 * All mock UI is aria-hidden — purely decorative.
 */

/* ─────────────────────────────────────────────────────────────────────────
   Payment flow mock
───────────────────────────────────────────────────────────────────────── */

const FLOW_STEPS = [
  {
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    label: "חוזה נחתם",
    sub:   "יוסי כהן חתם בנייד",
    time:  "10:14",
    color: "text-violet-400",
    dot:   "bg-violet-400",
  },
  {
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    label: "בקשת תשלום נשלחה",
    sub:   "SMS עם לינק מאובטח",
    time:  "10:15",
    color: "text-amber-400",
    dot:   "bg-amber-400",
  },
  {
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    label: "לקוח שילם מהנייד",
    sub:   "כרטיס אשראי, מאובטח",
    time:  "10:31",
    color: "text-blue-400",
    dot:   "bg-blue-400",
  },
  {
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    label: "עמלה ₪12,000 התקבלה",
    sub:   "העסקה נסגרת",
    time:  "10:31",
    color: "text-emerald-400",
    dot:   "bg-emerald-400",
  },
] as const;

function PaymentFlowMock() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-2xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">

        {/* Card header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-medium">
            הושלם ✓
          </span>
          <span className="text-xs font-semibold text-white/80">גביית עמלה</span>
        </div>

        {/* Amount hero */}
        <div className="bg-white/5 border border-white/10 rounded-xl py-5 text-center">
          <p className="text-[10px] text-indigo-400 mb-1">עמלת תיווך שהתקבלה</p>
          <p className="text-3xl font-bold text-white">₪12,000</p>
          <p className="text-[10px] text-indigo-400/70 mt-1">דירה ברחוב רוטשילד 15, תל אביב</p>
        </div>

        {/* Timeline */}
        <div className="relative space-y-0" role="list">
          {FLOW_STEPS.map((step, i) => (
            <div key={step.label} className="relative flex items-start gap-3 pb-3 last:pb-0" role="listitem">
              {/* Connector line */}
              {i < FLOW_STEPS.length - 1 && (
                <div
                  className="absolute right-[14px] top-5 bottom-0 w-px bg-white/10"
                  aria-hidden="true"
                />
              )}

              {/* Dot */}
              <div className={`relative z-10 w-7 h-7 rounded-full bg-white/8 border border-white/15
                               flex items-center justify-center shrink-0 ${step.color}`}>
                {step.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[11px] font-semibold ${step.color}`}>{step.label}</p>
                  <span className="text-[10px] text-indigo-400 shrink-0">{step.time}</span>
                </div>
                <p className="text-[10px] text-indigo-400/70 mt-0.5">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-1 border-t border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-indigo-400/60">17 דק׳ מחתימה לתשלום</span>
          <span className="text-[10px] text-emerald-400 font-medium">אפס מרדוף ✓</span>
        </div>
      </div>
    </GlassCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Bullet list
───────────────────────────────────────────────────────────────────────── */

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2.5 mt-1" dir="rtl">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-right">
          <svg
            className="shrink-0 mt-0.5 text-violet-400"
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-indigo-200/80 text-sm leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Exported section
───────────────────────────────────────────────────────────────────────── */

export function PaymentSpotlight() {
  return (
    <SectionWrapper id="payment" className="border-t border-white/10">
      <div
        dir="rtl"
        className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-20"
      >
        {/* Text column — right in RTL */}
        <AnimateIn delay={0} className="flex-1 flex flex-col gap-5 text-right">
          <SectionBadge>גביית עמלות</SectionBadge>

          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            עמלה שנחתמה היא לא
            <br />
            עמלה שנגבתה —
            <span className="text-violet-400"> עד עכשיו.</span>
          </h2>

          <p className="text-indigo-200/80 leading-relaxed">
            רוב המתווכים מפסידים ימים על מרדוף אחרי תשלומים שמגיעים להם.
            SignDeal סוגרת את הפער: ברגע שהחוזה נחתם, בקשת התשלום יוצאת אוטומטית —
            הלקוח משלם בנייד, אתם מקבלים התראה.
          </p>

          <Bullets
            items={[
              "בקשת תשלום נשלחת ב-SMS מיד לאחר החתימה",
              "הלקוח משלם בכרטיס אשראי מהנייד — בלי אפליקציה",
              "אתם מקבלים אישור ברגע שהכסף נכנס",
              "כל עסקה מתועדת: חוזה, חתימה ותשלום במקום אחד",
            ]}
          />

          <div className="pt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700
                         text-white text-sm font-semibold px-6 py-3 rounded-xl
                         active:scale-[0.98] transition-all shadow-lg shadow-violet-900/40"
            >
              התחל לגבות חכם יותר
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
                className="rotate-180"
              >
                <polyline points="9 18 3 12 9 6" />
              </svg>
            </Link>
          </div>
        </AnimateIn>

        {/* Mock column — left in RTL */}
        <AnimateIn delay={150} from="left" className="flex-1 w-full max-w-sm lg:max-w-md mx-auto lg:mx-0">
          <div aria-hidden="true">
            <PaymentFlowMock />
          </div>
        </AnimateIn>
      </div>
    </SectionWrapper>
  );
}
