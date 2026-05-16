"use client";

/**
 * PaymentPolling
 *
 * Shown on /billing/success when the user's subscription is still INCOMPLETE
 * (hyp-notify has not fired yet, or the browser landed before it completed).
 *
 * Strategy: call router.refresh() every 3 seconds, up to 10 attempts (~30 s).
 * Each refresh re-runs the server component, which re-queries the DB.
 * Once hyp-notify has activated the subscription (INCOMPLETE → TRIALING),
 * the server component renders TrialActivationSuccess instead of this component.
 *
 * If 10 attempts pass with no status change, the user is shown a "contact
 * support" message with a manual refresh link.
 */

import { useEffect, useState } from "react";
import { useRouter }           from "next/navigation";
import Link                    from "next/link";

const MAX_ATTEMPTS    = 10;
const POLL_INTERVAL_MS = 3_000;

export function PaymentPolling() {
  const router   = useRouter();
  const [attempts, setAttempts] = useState(0);

  const gaveUp = attempts >= MAX_ATTEMPTS;

  useEffect(() => {
    if (gaveUp) return;

    const timer = setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [attempts, gaveUp, router]);

  // ── Gave up after MAX_ATTEMPTS ────────────────────────────────────────────

  if (gaveUp) {
    return (
      <div className="px-6 py-8 flex flex-col items-center gap-5 text-center">

        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="text-2xl" aria-hidden="true">⚠️</span>
        </div>

        <div>
          <p className="text-base font-semibold text-gray-800 mb-1">
            לא הצלחנו לאמת את התשלום אוטומטית
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            ייתכן שהתשלום אושר אך האימות לוקח זמן רב יותר מהרגיל.
            נסה לרענן את הדף באופן ידני או פנה לתמיכה.
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={() => {
              setAttempts(0);    // reset → re-start polling
              router.refresh();
            }}
            className="w-full text-center text-sm font-bold py-3 rounded-xl
                       bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            רענן שוב
          </button>

          <a
            href="mailto:support@signdeal.co.il"
            className="w-full text-center text-sm py-2.5 rounded-xl
                       border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            פנה לתמיכה
          </a>

          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            עבור ללוח הבקרה →
          </Link>
        </div>
      </div>
    );
  }

  // ── Polling spinner ───────────────────────────────────────────────────────

  return (
    <div className="px-6 py-10 flex flex-col items-center gap-5 text-center">

      {/* Animated spinner */}
      <div
        className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"
        role="status"
        aria-label="טוען"
      />

      <div>
        <p className="text-base font-semibold text-gray-800 mb-1">
          מאמתים את התשלום…
        </p>
        <p className="text-sm text-gray-500 leading-relaxed">
          הכרטיס אושר — מעבדים את הפעלת המנוי. זה יקח שנייה.
        </p>
      </div>

      <p className="text-xs text-gray-400">
        ניסיון {attempts + 1} מתוך {MAX_ATTEMPTS}
      </p>
    </div>
  );
}
