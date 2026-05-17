"use client";

import { useState } from "react";

/**
 * UpdatePaymentButton
 *
 * Calls POST /api/billing/payment-method/update, then redirects the user to
 * the HYP hosted payment page to enter a new card.
 *
 * On success, HYP redirects back to /billing/success which updates card fields
 * only (status, billingFailures, firstPaymentAt, nextBillingAt are preserved).
 */
export function UpdatePaymentButton({ hasCard }: { hasCard: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleUpdate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/payment-method/update", { method: "POST" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "שגיאה לא ידועה. נסה שנית.");
        return;
      }

      const { checkoutUrl } = (await res.json()) as { checkoutUrl: string };
      window.location.assign(checkoutUrl);
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
        onClick={handleUpdate}
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
            מועבר לעמוד התשלום...
          </>
        ) : hasCard ? (
          "החלף אמצעי תשלום ←"
        ) : (
          "הוסף אמצעי תשלום ←"
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
