"use client";

/**
 * TermsConsentBox — a scroll-gated terms/disclosure area + a single required
 * consent checkbox for the Grow pre-iframe screen.
 *
 * Gate: the checkbox stays DISABLED until the user reaches the bottom of the
 * scrollable terms. Implemented with an IntersectionObserver on a bottom
 * sentinel, which also handles the key UX safeguard automatically: if the
 * content does NOT overflow (sentinel visible on mount), the checkbox is enabled
 * right away — the user is never trapped. The scroll region is keyboard-focusable
 * (tabIndex=0) so keyboard users can scroll to the end, and the disabled reason
 * is wired via aria-describedby for screen readers.
 */

import { useEffect, useRef, useState } from "react";
import {
  GROW_TERMS_INTRO,
  GROW_TERMS_DECLARATIONS,
  GROW_PREP_COPY,
} from "./onboardingContent";

interface TermsConsentBoxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function TermsConsentBox({ checked, onChange, disabled = false }: TermsConsentBoxProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    // No IntersectionObserver (very old env) → don't trap the user. Enable on the
    // next frame so we don't call setState synchronously inside the effect body.
    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setReachedEnd(true));
      return () => cancelAnimationFrame(raf);
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReachedEnd(true);
          io.disconnect(); // once reached, stay reached
        }
      },
      { root, threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const checkboxDisabled = disabled || !reachedEnd;

  return (
    <div>
      <div
        ref={scrollRef}
        role="region"
        aria-label="תנאים ואישורים"
        tabIndex={0}
        className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <p className="mb-2 text-gray-600">{GROW_TERMS_INTRO}</p>
        <ul className="list-disc space-y-1.5 pr-4">
          {GROW_TERMS_DECLARATIONS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {/* Sentinel: visible only when scrolled to the very bottom, or when the
            content does not overflow at all → enables the checkbox. */}
        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      </div>

      <label
        className={`mt-3 flex items-start gap-2 text-sm ${
          checkboxDisabled ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={checkboxDisabled}
          aria-describedby={!reachedEnd ? "grow-terms-scroll-hint" : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
        />
        <span>{GROW_PREP_COPY.checkboxLabel}</span>
      </label>

      {!reachedEnd && (
        <p id="grow-terms-scroll-hint" className="mt-1 text-xs text-gray-400">
          {GROW_PREP_COPY.scrollHint}
        </p>
      )}
    </div>
  );
}
