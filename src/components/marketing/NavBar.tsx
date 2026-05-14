"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { label: "מוצר",          href: "#features" },
  { label: "איך זה עובד",  href: "#how"      },
  { label: "מחירים",        href: "#pricing"  },
  { label: "שאלות נפוצות", href: "#faq"      },
] as const;

/**
 * Fixed marketing nav — premium polish pass.
 *
 * Scroll:   transparent above 60 px → frosted-glass below.
 * Smooth:   CSS `html { scroll-behavior: smooth }` handles desktop anchors.
 *           Mobile drawer must close before scrolling to avoid layout jump,
 *           so we use a 160 ms JS setTimeout + scrollIntoView there.
 * Active:   IntersectionObserver watches each section.  No scroll listener
 *           needed — fires only on intersection change, not every frame.
 *           Topmost currently-visible section wins (via document order).
 * Hover:    Pill bg on links (gap + padding maths keep visual spacing identical).
 * Drawer:   opacity + max-h combined transition; links stagger via CSS delay.
 * CTA:      lift + violet glow on hover.
 */
export function NavBar() {
  const [scrolled, setScrolled]           = useState(false);
  const [open, setOpen]                   = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Tracks which section IDs are currently in the IO detection band
  const intersectingRef = useRef<Set<string>>(new Set());

  // ── Frosted-glass header on scroll ──────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── ESC closes drawer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Active section — IntersectionObserver (no per-frame scroll reads) ───
  useEffect(() => {
    const sectionIds = NAV_LINKS.map(l => l.href.slice(1));

    // Pick topmost (document-order) intersecting section; null = none visible
    const updateActive = () => {
      const next = sectionIds.find(id => intersectingRef.current.has(id)) ?? null;
      setActiveSection(next);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            intersectingRef.current.add(entry.target.id);
          } else {
            intersectingRef.current.delete(entry.target.id);
          }
        });
        updateActive();
      },
      // Horizontal band spanning roughly the top 25 % of the viewport:
      //   top margin  –20 %  → detection starts 20 % below viewport top
      //   btm margin  –55 %  → detection ends   45 % from viewport top
      // Keeps exactly one section active at a time for typical section heights.
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });

    return () => obs.disconnect();
  }, []);

  // ── Mobile: close drawer then smooth-scroll after transition ─────────────
  // We can't rely on CSS scroll-behavior here because the drawer closing
  // changes layout height, which would disrupt an in-progress CSS smooth scroll.
  function handleMobileNavClick(href: string) {
    setOpen(false);
    setTimeout(() => {
      const el = document.getElementById(href.slice(1));
      // scrollIntoView respects the element's scroll-margin-top (scroll-mt-20)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160); // let max-h + opacity transition mostly finish
  }

  // ─────────────────────────────────────────────────────────────────────────

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
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div
            className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg
                       flex items-center justify-center
                       group-hover:bg-white/[0.16] group-hover:border-white/30
                       transition-all duration-200"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span
            className="text-white font-semibold text-lg tracking-tight
                       group-hover:text-white/90 transition-colors duration-200"
          >
            SignDeal
          </span>
        </Link>

        {/* ── Desktop center links ───────────────────────────────────────── */}
        {/*
          Gap is reduced to gap-1 (4 px) because each link now carries
          px-3 (12 px each side). Visual text-to-text spacing:
            12 px padding + 4 px gap + 12 px padding = 28 px  ←→ was gap-7 = 28 px.
          Spacing is identical; links now have a pill background to work with.
        */}
        <nav className="hidden md:flex items-center gap-1" aria-label="ניווט ראשי">
          {NAV_LINKS.map(({ label, href }) => {
            const sectionId = href.slice(1);
            const isActive  = activeSection === sectionId;
            return (
              <a
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative text-sm font-medium px-3 py-1.5 rounded-lg",
                  "transition-all duration-200 ease-out",
                  isActive
                    ? "text-white bg-white/[0.09]"
                    : "text-white/60 hover:text-white hover:bg-white/[0.05]",
                ].join(" ")}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* ── Desktop right actions ──────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="text-sm text-white/60 hover:text-white
                       transition-all duration-200 px-2 py-1.5 rounded-lg
                       hover:bg-white/[0.04]"
          >
            כניסה
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-white text-indigo-700
                       px-4 py-2 rounded-lg
                       shadow-sm shadow-black/10
                       hover:bg-indigo-50 hover:scale-[1.04]
                       hover:shadow-[0_0_20px_rgba(139,92,246,0.28)]
                       active:scale-[0.95]
                       transition-all duration-200 ease-out"
          >
            התחל חינם
          </Link>
        </div>

        {/* ── Mobile hamburger ──────────────────────────────────────────── */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden text-white/70 hover:text-white p-1.5 rounded-lg
                     hover:bg-white/10 active:scale-[0.90]
                     transition-all duration-150"
          aria-label={open ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={open}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6"  x2="21" y2="6"  />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {/*
        Combined max-height + opacity transition creates a slide-fade combo.
        On open:  max-h expands + opacity rises, links stagger via CSS delay.
        On close: max-h collapses + opacity falls, no link stagger (all instant).
        aria-hidden keeps screen readers out when collapsed.
      */}
      <div
        className={[
          "md:hidden overflow-hidden",
          "transition-all duration-300 ease-out",
          open
            ? "max-h-[28rem] opacity-100 border-b border-white/10"
            : "max-h-0 opacity-0",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div
          className="bg-indigo-950 sm:bg-indigo-950/95 sm:backdrop-blur-md px-6 py-4 flex flex-col gap-0.5"
          dir="rtl"
        >
          {/* Nav links — staggered fade-up on open */}
          {NAV_LINKS.map(({ label, href }, i) => (
            <a
              key={href}
              href={href}
              onClick={(e) => { e.preventDefault(); handleMobileNavClick(href); }}
              style={{ transitionDelay: open ? `${i * 45 + 50}ms` : "0ms" }}
              className={[
                "text-sm font-medium py-3 px-3 rounded-xl",
                "transition-all duration-200 ease-out",
                "border-b border-white/[0.06] last:border-b-0",
                "hover:text-white hover:bg-white/[0.06]",
                open
                  ? "text-white/80 opacity-100 translate-y-0"
                  : "text-white/80 opacity-0 translate-y-1.5",
              ].join(" ")}
            >
              {label}
            </a>
          ))}

          {/* Auth actions — stagger after nav links */}
          <div
            className="flex flex-col gap-2.5 pt-3 mt-1 transition-all duration-200 ease-out"
            style={{
              transitionDelay: open ? `${NAV_LINKS.length * 45 + 60}ms` : "0ms",
              opacity:   open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(6px)",
            }}
          >
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-sm text-white/60 hover:text-white py-2
                         text-center transition-colors duration-200"
            >
              כניסה לחשבון קיים
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="text-sm font-bold bg-white text-indigo-700
                         px-4 py-3 rounded-xl text-center
                         hover:bg-indigo-50 hover:scale-[1.02]
                         active:scale-[0.97]
                         transition-all duration-200 ease-out"
            >
              התחל חינם
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
