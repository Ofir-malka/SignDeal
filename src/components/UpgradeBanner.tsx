"use client";

import type { UsageData } from "@/components/UsageCard";

// ── Upgrade navigation ────────────────────────────────────────────────────────
// Uses a hard browser navigation rather than Next.js client-side routing so
// the browser natively handles the #pricing hash scroll (client-side routing
// from /dashboard to /#pricing does not reliably trigger the scroll).
//
// FUTURE: replace this with the billing upgrade flow when Stripe/Rapyd is
// connected. The function signature can accept a targetPlan param so it works
// for Starter→Pro and Pro→Enterprise upgrades from the same CTA.
function navigateToUpgrade(/* targetPlan: "PRO" | "ENTERPRISE" */ ) {
  // TODO: open billing portal / upgrade modal when billing is connected.
  window.location.href = "/#pricing";
}

// ── Banner variant logic ───────────────────────────────────────────────────────
// Returns null when no banner should be shown.
function getBannerVariant(data: UsageData): "inactive" | "at-limit" | "near-limit" | null {
  // Subscription inactive (EXPIRED / CANCELED / PAST_DUE / trial expired)
  if (!data.isActive) return "inactive";

  // Only STARTER plan gets contract limit banners — PRO/ENTERPRISE have
  // high or unlimited caps that don't warrant a warning.
  if (data.plan !== "STARTER") return null;

  if (data.remaining !== null && data.remaining === 0) return "at-limit";
  if (data.remaining !== null && data.remaining === 1) return "near-limit";

  return null;
}

// ── Variant content ────────────────────────────────────────────────────────────
const VARIANT_COPY = {
  "inactive": {
    icon:    "⏰",
    title:   "תקופת הניסיון שלך הסתיימה",
    body:    "חוזים קיימים נגישים, אך יצירת חוזים חדשים חסומה. שדרג כדי להמשיך.",
    bg:      "bg-amber-50 border-amber-200",
    titleCl: "text-amber-800",
    bodyCl:  "text-amber-700",
    btnCl:   "bg-amber-600 hover:bg-amber-700 text-white",
  },
  "at-limit": {
    icon:    "🚫",
    title:   "הגעת למגבלת החוזים של המסלול שלך",
    body:    `הגעת ל-${3} החוזים הפעילים המותרים במסלול Starter. שדרג ל-Pro ליצירת חוזים ללא הגבלה.`,
    bg:      "bg-red-50 border-red-200",
    titleCl: "text-red-800",
    bodyCl:  "text-red-700",
    btnCl:   "bg-red-600 hover:bg-red-700 text-white",
  },
  "near-limit": {
    icon:    "⚠️",
    title:   "הגעת כמעט למכסת החוזים שלך",
    body:    "נותר לך חוזה פעיל אחד בלבד במסלול Starter. שדרג ל-Pro לפני שתחסם.",
    bg:      "bg-yellow-50 border-yellow-200",
    titleCl: "text-yellow-800",
    bodyCl:  "text-yellow-700",
    btnCl:   "bg-yellow-600 hover:bg-yellow-700 text-white",
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────
export function UpgradeBanner({ data }: { data: UsageData | null }) {
  if (!data) return null;

  const variant = getBannerVariant(data);
  if (!variant) return null;

  const copy = VARIANT_COPY[variant];

  return (
    <div
      className={`flex items-start sm:items-center gap-3 rounded-xl border px-4 py-3 mb-5 ${copy.bg}`}
      role="alert"
    >
      {/* Icon */}
      <span className="text-xl shrink-0 mt-0.5 sm:mt-0">{copy.icon}</span>

      {/* Copy */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${copy.titleCl}`}>{copy.title}</p>
        <p className={`text-xs mt-0.5 ${copy.bodyCl}`}>{copy.body}</p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={navigateToUpgrade}
        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${copy.btnCl}`}
      >
        שדרג ל-PRO
      </button>
    </div>
  );
}
