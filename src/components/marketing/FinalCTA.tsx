import Link from "next/link";

/**
 * FinalCTA — full-width conversion section placed just before MarketingFooter.
 * Server component — no interactivity required.
 *
 * WhatsApp link: update WHATSAPP_LINK with the real SignDeal support number.
 * Format: https://wa.me/972XXXXXXXXX (no +, no dashes)
 */

// TODO: replace with real SignDeal WhatsApp number
const WHATSAPP_LINK = "https://wa.me/9720500000000";

export function FinalCTA() {
  return (
    <section
      dir="rtl"
      className="relative py-24 sm:py-32 overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800"
    >
      {/* Radial violet glow — purely decorative */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="w-[700px] h-[700px] bg-violet-600/20 rounded-full blur-3xl" />
      </div>

      {/* Top separator */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-white/10"
      />

      {/* Content */}
      <div className="relative max-w-3xl mx-auto px-6 text-center flex flex-col items-center gap-8">

        {/* Badge */}
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300 uppercase tracking-widest">
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          מוכנים להתחיל?
        </span>

        {/* Headline — specific promise, not vague aspiration */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
          תוך 3 דקות יש לכם
          <br className="hidden sm:block" />
          <span className="text-violet-300"> חוזה מוכן לחתימה.</span>
        </h2>

        {/* Sub-copy — names the pain and the outcome */}
        <p className="text-lg sm:text-xl text-indigo-200/80 leading-relaxed max-w-xl">
          שלחו, חתמו וגבו עמלות מהנייד — מהיום בלי ניירת ובלי מרדפים.
        </p>

        {/* CTA pair */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">

          {/* Primary — self-serve registration */}
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5
                       bg-white text-indigo-700 font-bold text-base
                       px-10 py-4 rounded-2xl
                       hover:bg-indigo-50 active:scale-[0.98]
                       transition-all shadow-xl shadow-black/25"
          >
            התחל חינם עכשיו
            <svg
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              className="rotate-180"
            >
              <polyline points="9 18 3 12 9 6" />
            </svg>
          </Link>

          {/* Secondary — WhatsApp (high-conversion path for Israeli B2B) */}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5
                       bg-white/10 border border-white/20 text-white font-semibold text-base
                       px-8 py-4 rounded-2xl
                       hover:bg-white/15 active:scale-[0.98]
                       transition-all"
          >
            {/* WhatsApp icon */}
            <svg
              width="18" height="18" viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="text-emerald-400 flex-shrink-0"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            דברו איתנו ב-WhatsApp
          </a>
        </div>

        {/* Trust micro-copy */}
        <p className="text-xs text-indigo-300/50 tracking-wide">
          ללא כרטיס אשראי · ביטול בכל עת · תמיכה בעברית
        </p>

      </div>
    </section>
  );
}
