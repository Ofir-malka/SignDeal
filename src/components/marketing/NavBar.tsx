"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { label: "מוצר",          href: "#features" },
  { label: "איך זה עובד",  href: "#how"      },
  { label: "מחירים",        href: "#pricing"  },
  { label: "שאלות נפוצות", href: "#faq"      },
] as const;

/**
 * Fixed marketing nav.
 *
 * Scroll behaviour: transparent above 60px, frosted-glass below.
 * Mobile: hamburger collapses links into a max-h slide drawer.
 * Desktop: center anchor links + login ghost + register CTA.
 */
export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close drawer when ESC is pressed
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      dir="rtl"
      className={[
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-indigo-950/80 backdrop-blur-md border-b border-white/10 shadow-lg shadow-black/10"
          : "bg-transparent",
      ].join(" ")}
    >
      {/* ── Main bar ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
            <svg
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">SignDeal</span>
        </Link>

        {/* Desktop center links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="ניווט ראשי">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-sm text-white/65 hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="text-sm text-white/65 hover:text-white transition-colors px-1"
          >
            כניסה
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-white text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50 active:scale-[0.98] transition-all shadow-sm shadow-black/10"
          >
            התחל חינם
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label={open ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={open}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6"  y2="18" />
              <line x1="6"  y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6"  x2="21" y2="6"  />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      <div
        className={[
          "md:hidden overflow-hidden transition-all duration-300",
          open ? "max-h-96 border-b border-white/10" : "max-h-0",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div
          className="bg-indigo-950/95 backdrop-blur-md px-6 py-5 flex flex-col gap-3"
          dir="rtl"
        >
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="text-sm text-white/80 hover:text-white py-1.5 border-b border-white/5 transition-colors"
            >
              {label}
            </a>
          ))}

          <div className="flex flex-col gap-2.5 pt-2">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-sm text-white/70 hover:text-white py-2 text-center transition-colors"
            >
              כניסה לחשבון קיים
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold bg-white text-indigo-700 px-4 py-3 rounded-xl text-center hover:bg-indigo-50 active:scale-[0.98] transition-all"
            >
              התחל חינם
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
