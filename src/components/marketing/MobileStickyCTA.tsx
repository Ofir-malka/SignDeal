"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

/**
 * MobileStickyCTA — fixed bottom bar, mobile-only (hidden on sm+).
 *
 * Behaviour:
 *   • Hidden until user scrolls past 500 px (clears the hero CTA).
 *   • Fades in with a CSS transition — no layout shift.
 *   • z-40 keeps it above page content but below modals (z-50).
 *   • `sm:hidden` ensures it never appears on tablet/desktop.
 *
 * Performance:
 *   • Scroll listener is `passive` — no jank.
 *   • Single boolean state — minimal re-renders.
 *   • The bar is removed from the DOM until visible to avoid
 *     covering footer on very short viewports.
 *
 * Safe area: `pb-safe` (via Tailwind's `env(safe-area-inset-bottom)`)
 *   handles iPhone home-indicator overlap without extra dependencies.
 *   Falls back to `pb-4` on Android / desktop.
 */

const WHATSAPP_LINK = "https://wa.me/9720500000000";

export function MobileStickyCTA() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const THRESHOLD = 500;

    // Initialise on mount without waiting for scroll
    setShow(window.scrollY > THRESHOLD);

    const handler = () => setShow(window.scrollY > THRESHOLD);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    /* Outer: always rendered for transition smoothness, opacity drives visibility */
    <div
      aria-hidden={!show}
      className={[
        // Visibility — opacity + pointer-events avoids layout shift
        "fixed bottom-0 inset-x-0 z-40 sm:hidden",
        "transition-all duration-300 ease-out",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
      ].join(" ")}
    >
      {/* Glass bar */}
      <div
        className="backdrop-blur-xl bg-indigo-950/90 border-t border-white/10
                   px-4 pt-3 pb-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2.5">

          {/* Primary CTA — full width */}
          <Link
            href="/register"
            className="flex-1 inline-flex items-center justify-center gap-2
                       bg-white text-indigo-700 font-bold text-sm
                       px-5 py-3.5 rounded-xl
                       hover:bg-indigo-50 active:scale-[0.98]
                       transition-all shadow-lg shadow-black/30"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            התחילו עכשיו — חינם
          </Link>

          {/* WhatsApp icon button — secondary, compact */}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="דברו איתנו ב-WhatsApp"
            className="shrink-0 w-12 h-12 rounded-xl
                       bg-emerald-500/15 border border-emerald-500/30
                       flex items-center justify-center
                       hover:bg-emerald-500/25 active:scale-[0.96]
                       transition-all"
          >
            <svg
              width="20" height="20" viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="text-emerald-400"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
          </a>

        </div>
      </div>
    </div>
  );
}
