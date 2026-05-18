"use client";

import { useState } from "react";

/**
 * ConnectButton
 *
 * Calls POST /api/stripe/connect/onboard:
 *   • If the response contains { url }, redirects the broker to Stripe's
 *     hosted Express onboarding flow.
 *   • If the response contains { alreadyComplete: true }, shows a confirmation
 *     message (should not normally be reached — the parent page hides this
 *     button for COMPLETE accounts, but we handle it defensively).
 *
 * Matches the exact className/loading/error pattern of UpdatePaymentButton.
 */
export function ConnectButton({ label = "התחבר ל-Stripe ←" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "שגיאה לא ידועה. נסה שנית.");
        return;
      }

      const data = await res.json() as { url?: string; alreadyComplete?: boolean };

      if (data.alreadyComplete) {
        // Shouldn't normally be reached (page hides this button for COMPLETE accounts),
        // but reload to show the correct UI state.
        window.location.reload();
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      setError("לא התקבל קישור הרשמה. נסה שנית.");
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
        onClick={handleConnect}
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
          label
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
