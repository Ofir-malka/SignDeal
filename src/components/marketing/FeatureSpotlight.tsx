import { GlassCard } from "@/components/marketing/ui/GlassCard";
import { AnimateIn }  from "@/components/marketing/ui/AnimateIn";

/**
 * Feature Spotlight — 4 deep-dive blocks, alternating text/mock layout.
 *
 * Layout logic (RTL context):
 *   Even blocks (0, 2): text on right (RTL default), mock on left
 *   Odd blocks  (1, 3): reversed — text on left,  mock on right
 *
 * All mocks are coded in pure Tailwind — no real screenshots required.
 * They are aria-hidden decorative elements.
 */

/* ─────────────────────────────────────────────────────────────────────────
   Bullet list helper
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
   Mock UIs — all aria-hidden, purely decorative
───────────────────────────────────────────────────────────────────────── */

/** Mock 1: Contract creation form */
function ContractFormMock() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-2xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-white/80">חוזה תיווך חדש</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-400/20 text-violet-300 border border-violet-400/30">
            טיוטה
          </span>
        </div>

        {/* Template selector */}
        <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="text-xs text-indigo-200">חוזה תיווך מכר — תבנית סטנדרטית</span>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {[
            { label: "שם לקוח",    value: "יוסי כהן"              },
            { label: "כתובת הנכס", value: "רחוב הרצל 12, תל אביב" },
            { label: "עמלה (₪)",  value: "8,500"                  },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-indigo-400 mb-1 text-right">{label}</p>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 text-right">
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Action */}
        <button className="w-full bg-violet-500/25 border border-violet-400/40 text-violet-200 text-xs font-semibold py-2.5 rounded-lg text-center hover:bg-violet-500/35 transition-colors">
          צור חוזה ←
        </button>
      </div>
    </GlassCard>
  );
}

/** Mock 2: SMS notification + signing pad */
function SigningMock() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-2xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-3.5">
        {/* SMS notification bubble */}
        <div className="bg-green-500/10 border border-green-400/25 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-green-400 font-semibold">📱 SMS נשלח</span>
          </div>
          <p className="text-xs text-green-200/80 leading-relaxed">
            שלום יוסי, חוזה התיווך שלך מוכן לחתימה. לחצו לחתימה:
            <span className="text-green-400 underline"> sign.deal/x7k2</span>
          </p>
        </div>

        {/* Signing area */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-emerald-400">מאובטח ✓</span>
            <span className="text-[10px] text-indigo-300">חוזה תיווך — יוסי כהן</span>
          </div>
          <div className="p-4 flex flex-col items-center gap-2">
            <p className="text-[10px] text-indigo-400">חתמו כאן</p>
            {/* Signature squiggle */}
            <svg viewBox="0 0 200 55" className="w-full h-10 opacity-90" aria-hidden="true">
              <path
                d="M15 35 Q30 12 50 32 Q68 50 88 28 Q108 8 130 38 Q150 58 175 30"
                fill="none"
                stroke="#a78bfa"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="w-full border-t border-white/15 pt-2 flex items-center justify-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[10px] text-emerald-400 font-medium">נחתם — 14:22</span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

/** Mock 3: Payment request + status */
function PaymentMock() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-2xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">
        {/* Invoice header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-indigo-400">חוזה #1042 · יוסי כהן</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
            שולם ✓
          </span>
        </div>

        {/* Amount display */}
        <div className="bg-white/5 border border-white/10 rounded-xl py-5 text-center">
          <p className="text-[10px] text-indigo-400 mb-1">סכום עמלה</p>
          <p className="text-3xl font-bold text-white">₪8,500</p>
          <p className="text-[10px] text-indigo-400 mt-1">כולל מע״מ</p>
        </div>

        {/* Payment link row */}
        <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-xs text-indigo-200/80">לינק תשלום נשלח ב-SMS</span>
        </div>

        {/* Timeline */}
        <div className="space-y-1.5 pt-1">
          {[
            { label: "בקשת תשלום נשלחה",  time: "11:00", done: true  },
            { label: "לינק נפתח על ידי הלקוח", time: "11:14", done: true  },
            { label: "תשלום התקבל",       time: "11:21", done: true  },
          ].map(({ label, time, done }) => (
            <div key={label} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className={done ? "text-emerald-400" : "text-indigo-600"}>●</span>
                <span className={done ? "text-indigo-200" : "text-indigo-500"}>{label}</span>
              </div>
              <span className="text-indigo-400">{time}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

/** Mock 4: Automated SMS/WhatsApp reminder flow */
function RemindersMock() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-2xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-indigo-400">3 תזכורות מתוזמנות</span>
          <span className="text-xs font-semibold text-white/80">תזכורות אוטומטיות</span>
        </div>

        {/* Message bubbles */}
        <div className="space-y-2.5">
          {/* Sent */}
          <div className="bg-violet-500/15 border border-violet-400/25 rounded-xl rounded-tl-sm px-3 py-2.5">
            <p className="text-xs text-violet-100 leading-relaxed">
              שלום יוסי, נשמח לקבל את חתימתך על חוזה התיווך.
              לחצו לחתימה: <span className="text-violet-300 underline">sign.deal/x7k2</span>
            </p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-violet-400/60">נשלח אוטומטית</span>
              <span className="text-[10px] text-indigo-400">יום א׳, 09:00 · נקרא ✓</span>
            </div>
          </div>

          {/* Follow-up */}
          <div className="bg-white/5 border border-white/10 rounded-xl rounded-tl-sm px-3 py-2.5">
            <p className="text-xs text-indigo-200 leading-relaxed">
              תזכורת: החוזה עדיין ממתין לחתימתך. לחצו לחתימה כאן.
            </p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-indigo-500">נשלח אוטומטית</span>
              <span className="text-[10px] text-indigo-400">יום ג׳, 09:00</span>
            </div>
          </div>

          {/* Signed event */}
          <div className="bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-xs text-emerald-300 font-medium">יוסי חתם על החוזה</p>
            </div>
            <p className="text-[10px] text-emerald-400/60 mt-0.5 mr-5">יום ד׳, 11:23</p>
          </div>
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px]">
          <span className="text-emerald-400 font-medium">הושלם ✓</span>
          <span className="text-indigo-400">2 תזכורות נשלחו · אפס מאמץ ידני</span>
        </div>
      </div>
    </GlassCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Spotlight data
───────────────────────────────────────────────────────────────────────── */

const SPOTLIGHTS = [
  {
    eyebrow: "תבניות מוכנות לשימוש",
    heading: "חוזה תיווך מוכן תוך דקות",
    body:    "בחרו תבנית מאושרת, מלאו את פרטי הנכס, הלקוח והעמלה — החוזה נוצר אוטומטית ומוכן לשליחה. שמרו תבניות מותאמות לסגנון העבודה שלכם.",
    bullets: [
      "תבניות לחוזי תיווך, שכירות ומכר",
      "שדות חכמים עם מילוי מהיר",
      "PDF מוכן להורדה ולשליחה",
    ] as const,
    mock: <ContractFormMock />,
  },
  {
    eyebrow: "חתימה מהנייד, ללא אפליקציה",
    heading: "הלקוח חותם בדקה, בכל מקום",
    body:    "לינק חתימה ייחודי נשלח ב-SMS. הלקוח פותח בדפדפן, קורא את החוזה, וחותם עם האצבע. אתם מקבלים התראה ברגע שהחתימה הושלמה.",
    bullets: [
      "חתימה עם האצבע מכל מכשיר",
      "ללא הרשמה ללקוח",
      "תיעוד מלא עם חותמת זמן",
    ] as const,
    mock: <SigningMock />,
  },
  {
    eyebrow: "גבייה ישירה מהחוזה",
    heading: "הפסיקו לרדוף אחרי העמלה",
    body:    "לחצו 'שלח בקשת תשלום' — הלקוח מקבל לינק מאובטח, משלם בכרטיס, והכסף מגיע אליכם ישירות. אין בנק, אין העברה ידנית.",
    bullets: [
      "תשלום מאובטח בכרטיס אשראי",
      "אישור אוטומטי לשני הצדדים",
      "היסטוריית תשלומים מלאה",
    ] as const,
    mock: <PaymentMock />,
  },
  {
    eyebrow: "המערכת עובדת בשבילכם",
    heading: "SMS ו-WhatsApp אוטומטיים",
    body:    "הגדירו מתי לשלוח תזכורות — המערכת שולחת אוטומטית לכל לקוח שלא חתם או שלא שילם. אתם מקבלים התראה רק כשיש פעולה נדרשת.",
    bullets: [
      "תזכורות SMS ו-WhatsApp",
      "לוח זמנים מותאם אישית",
      "הודעות בעברית עם שם הלקוח",
    ] as const,
    mock: <RemindersMock />,
  },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
   Single spotlight block (internal)
───────────────────────────────────────────────────────────────────────── */

interface SpotlightBlockProps {
  eyebrow: string;
  heading: string;
  body: string;
  bullets: readonly string[];
  mock: React.ReactNode;
  reversed: boolean;
  index: number;
}

function SpotlightBlock({
  eyebrow, heading, body, bullets, mock, reversed, index,
}: SpotlightBlockProps) {
  return (
    <div className="border-b border-white/10 last:border-b-0 py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div
          dir="rtl"
          className={[
            "flex flex-col lg:items-center gap-14 lg:gap-20",
            reversed ? "lg:flex-row-reverse" : "lg:flex-row",
          ].join(" ")}
        >
          {/* Text column */}
          <AnimateIn delay={0} className="flex-1 flex flex-col gap-5 text-right">
            {/* Eyebrow */}
            <span className="text-sm font-semibold text-violet-400 tracking-wide">
              {eyebrow}
            </span>

            {/* Heading */}
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
              {heading}
            </h3>

            {/* Body */}
            <p className="text-indigo-200/80 leading-relaxed">
              {body}
            </p>

            {/* Bullets */}
            <Bullets items={bullets} />
          </AnimateIn>

          {/* Mock column */}
          <AnimateIn delay={150} className="flex-1 w-full max-w-sm lg:max-w-md mx-auto lg:mx-0">
            <div aria-hidden="true">{mock}</div>
          </AnimateIn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Exported component
───────────────────────────────────────────────────────────────────────── */

export function FeatureSpotlight() {
  return (
    <div className="border-t border-white/10">
      {SPOTLIGHTS.map((spotlight, i) => (
        <SpotlightBlock
          key={spotlight.heading}
          {...spotlight}
          reversed={i % 2 === 1}
          index={i}
        />
      ))}
    </div>
  );
}
