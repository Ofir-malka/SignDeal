import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";

/**
 * ComparisonSection — before/after contrast showing SignDeal vs old workflow.
 *
 * Layout:
 *   Mobile  : two columns stacked vertically (old above, SignDeal below).
 *   Desktop : side-by-side two-column grid, equal width.
 *
 * Each column lists the 5 workflow dimensions with matching visual rhythm
 * so the reader can scan row-by-row across columns.
 */

const ROWS = [
  {
    category: "יצירת חוזה",
    old:      "Word / PDF ידני — שגיאות, גרסאות שונות, זמן יקר",
    next:     "תבנית מוכנה + מילוי אוטומטי — חוזה מוכן תוך 3 דקות",
  },
  {
    category: "שליחה לחתימה",
    old:      "PDF בוואטסאפ — לא ברור אם נפתח, לא חזר חתום",
    next:     "SMS עם לינק אישי — הלקוח חותם מהנייד, ללא אפליקציה",
  },
  {
    category: "מעקב סטטוס",
    old:      "שיחות, WhatsApp ופתקים — אין תמונה ברורה",
    next:     "לוח בקרה חי — חתם / לא חתם / שילם, בזמן אמת",
  },
  {
    category: "גביית עמלה",
    old:      "מרדוף, שיחה מביכה, העברה בנקאית, המתנה",
    next:     "לינק תשלום ב-SMS — כרטיס אשראי, קבלה אוטומטית",
  },
  {
    category: "תיעוד מול לקוח",
    old:      "מסמכים מפוזרים ב-WhatsApp ובמייל — קשה לאתר",
    next:     "הכל נשמר יחד: חוזה, חתימה וקבלה — במקום אחד",
  },
] as const;

/* ── Shared row item ─────────────────────────────────────────────────────── */

function RowItem({
  category,
  text,
  variant,
}: {
  category: string;
  text: string;
  variant: "old" | "new";
}) {
  const isNew = variant === "new";
  return (
    <div className="flex items-start gap-3" dir="rtl">
      {/* Bullet */}
      <div
        className={[
          "shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center",
          isNew
            ? "bg-violet-400/20 border border-violet-400/40"
            : "bg-red-400/10 border border-red-400/25",
        ].join(" ")}
        aria-hidden="true"
      >
        {isNew ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#f87171" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6"  y1="6" x2="18" y2="18" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="text-right flex-1">
        <p
          className={[
            "text-[10px] font-semibold uppercase tracking-wider mb-0.5",
            isNew ? "text-violet-400/70" : "text-red-400/60",
          ].join(" ")}
        >
          {category}
        </p>
        <p
          className={[
            "text-sm leading-relaxed",
            isNew ? "text-indigo-100/90 font-medium" : "text-indigo-300/55",
          ].join(" ")}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

/* ── Exported section ────────────────────────────────────────────────────── */

export function ComparisonSection() {
  return (
    <SectionWrapper id="comparison" className="border-t border-white/10">

      {/* Section header */}
      <div dir="rtl" className="flex flex-col items-center text-center mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>לפני / אחרי</SectionBadge>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2 max-w-2xl mx-auto">
            במקום לרדוף אחרי חתימות ותשלומים —
            <br className="hidden sm:block" />
            מנהלים הכל במקום אחד
          </h2>
          <p className="text-indigo-200/60 mt-4 max-w-lg mx-auto text-base leading-relaxed">
            כל מה שעשיתם ידנית — חוזה, חתימה, מעקב, גבייה — SignDeal עושה אוטומטית.
          </p>
        </AnimateIn>
      </div>

      {/* Two-column comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* OLD WAY column */}
        <AnimateIn delay={60} from="bottom">
          <GlassCard
            className="h-full border border-red-400/15 bg-red-400/[0.03] hover:border-red-400/25 transition-colors duration-300"
          >
            <div className="p-6 flex flex-col gap-5" dir="rtl">

              {/* Column header */}
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
                <div
                  className="w-6 h-6 rounded-full bg-red-400/15 border border-red-400/30
                               flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#f87171" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6"  y1="6" x2="18" y2="18" />
                  </svg>
                </div>
                <span className="text-base font-bold text-red-400/90">הדרך הישנה</span>
              </div>

              {/* Items */}
              <div className="space-y-4">
                {ROWS.map((row) => (
                  <RowItem
                    key={row.category}
                    category={row.category}
                    text={row.old}
                    variant="old"
                  />
                ))}
              </div>
            </div>
          </GlassCard>
        </AnimateIn>

        {/* SIGNDEAL column */}
        <AnimateIn delay={140} from="bottom">
          <GlassCard
            variant="elevated"
            className="h-full border-violet-400/25 hover:border-violet-400/40 transition-colors duration-300"
          >
            <div className="p-6 flex flex-col gap-5" dir="rtl">

              {/* Column header */}
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
                <div
                  className="w-6 h-6 rounded-full bg-violet-400/25 border border-violet-400/50
                               flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-base font-bold text-violet-300">SignDeal</span>
              </div>

              {/* Items */}
              <div className="space-y-4">
                {ROWS.map((row) => (
                  <RowItem
                    key={row.category}
                    category={row.category}
                    text={row.next}
                    variant="new"
                  />
                ))}
              </div>
            </div>
          </GlassCard>
        </AnimateIn>

      </div>
    </SectionWrapper>
  );
}
