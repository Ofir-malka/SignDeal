"use client";

/**
 * PlanUpgradeButton
 *
 * Reusable client component that initiates the HYP checkout flow for a
 * specific plan + interval.  On click it calls POST /api/billing/checkout,
 * receives the signed HYP payment-page URL, and redirects the browser there.
 *
 * Used in:
 *   - /settings/billing (upgrade panel)
 *
 * PricingSection has its own inline checkout logic to support per-card
 * loading states across the plan grid; this component covers the simpler
 * single-button use case.
 */

import { useState } from "react";

interface Props {
  plan:       "STANDARD" | "GROWTH" | "PRO";
  interval:   "MONTHLY"  | "YEARLY";
  label?:     string;
  className?: string;
  disabled?:  boolean;
}

export function PlanUpgradeButton({
  plan,
  interval,
  label     = "שדרג למסלול",
  className = "",
  disabled  = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleClick() {
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan, interval }),
      });
      const data = await res.json() as { checkoutUrl?: string; error?: string };

      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "שגיאה בפתיחת עמוד התשלום");
        return;
      }

      // Full navigation — browser leaves the app and opens HYP's hosted page.
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("שגיאת רשת — נסה שוב");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || disabled}
        className={className}
      >
        {loading ? "פותח עמוד תשלום..." : label}
      </button>

      {error && (
        <p className="text-xs text-red-500 text-center leading-snug">{error}</p>
      )}
    </div>
  );
}
