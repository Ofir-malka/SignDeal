"use client";

import { useState } from "react";

/**
 * RefreshButton
 *
 * Calls POST /api/stripe/connect/refresh to generate a new (non-expired)
 * Stripe Account Link and redirects the broker to it.
 *
 * Rendered on the /settings/payments/onboarding/refresh page when Stripe
 * redirects here because the original onboarding link has expired.
 *
 * Does NOT create a new Stripe account — only re-generates the link.
 */
export function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/connect/refresh", { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "שגיאה לא ידועה. נסה שנית.");
        return;
      }

      const { url } = await res.json() as { url: string };

      if (!url) {
        setError("לא התקבל קישור. נסה שנית.");
        return;
      }

      window.location.assign(url);
    } catch {
      setError("שגיאת רשת. בדוק את החיבור ונסה שנית.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2.5 w-full px-6 py-3.5 rounded-xl
                   text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700
                   disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            מועבר ל-Stripe...
          </>
        ) : (
          "המשך הרשמה ←"
        )}
      </button>

      {error && (
        <p className="text-sm text-red-600 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
