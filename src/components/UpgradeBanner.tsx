"use client";

import type { UsageData } from "@/components/UsageCard";

// ── Upgrade navigation ────────────────────────────────────────────────────────
// Sends dashboard users to the billing settings page where PlanUpgradeButton
// lives.  Hard navigation (not router.push) so the full page reloads and picks
// up the latest subscription state from the server.
function navigateToUpgrade() {
  window.location.assign("/settings/billing");
}

// ── Days left helper ──────────────────────────────────────────────────────────
function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ── Banner variant logic ──────────────────────────────────────────────────────
type BannerVariant =
  | "expired"        // trial ended or subscription inactive
  | "trial-ending"   // ≤ 3 days left in trial
  | "at-limit"       // 0 docs remaining this month
  | "near-limit";    // 1 doc remaining this month

function getBannerVariant(data: UsageData): BannerVariant | null {
  // AGENCY has no limit — never show a usage banner
  if (data.monthlyDocLimit === null) return null;

  // Subscription inactive (expired trial / CANCELED / PAST_DUE)
  if (!data.isActive) return "expired";

  // Trial ending soon (≤ 3 days)
  if (data.isTrialing && data.trialEndsAt) {
    const left = daysLeft(data.trialEndsAt);
    if (left <= 3) return "trial-ending";
  }

  // Monthly limit reached or near
  if (data.monthlyRemaining === 0) return "at-limit";
  if (data.monthlyRemaining === 1) return "near-limit";

  return null;
}

// ── Variant content ────────────────────────────────────────────────────────────
function getVariantCopy(data: UsageData, variant: BannerVariant) {
  switch (variant) {

    case "expired":
      return {
        icon:    "⏰",
        title:   data.isTrialing
          ? "תקופת הניסיון שלך הסתיימה"
          : "המנוי שלך אינו פעיל",
        body:    "חוזים קיימים נגישים לצפייה, אך יצירת חוזים חדשים חסומה. בחר מסלול כדי להמשיך.",
        cta:     "בחר מסלול",
        bg:      "bg-amber-50 border-amber-200",
        titleCl: "text-amber-800",
        bodyCl:  "text-amber-700",
        btnCl:   "bg-amber-600 hover:bg-amber-700 text-white",
      };

    case "trial-ending": {
      const left = daysLeft(data.trialEndsAt!);
      return {
        icon:    "⏳",
        title:   left === 0
          ? "הניסיון שלך מסתיים היום"
          : `נותרו ${left} ${left === 1 ? "יום" : "ימים"} לניסיון`,
        body:    `בחר מסלול לפני שהניסיון יסתיים כדי להמשיך ליצור חוזים ללא הפרעה.`,
        cta:     "בחר מסלול עכשיו",
        bg:      "bg-violet-50 border-violet-200",
        titleCl: "text-violet-800",
        bodyCl:  "text-violet-700",
        btnCl:   "bg-violet-600 hover:bg-violet-700 text-white",
      };
    }

    case "at-limit":
      return {
        icon:    "🚫",
        title:   `הגעת למכסת ${data.monthlyDocLimit} החוזים החודשיים`,
        body:    `המכסה של המסלול ${data.planLabel} הסתיימה לחודש זה. שדרג כדי ליצור חוזים נוספים.`,
        cta:     "שדרג מסלול",
        bg:      "bg-red-50 border-red-200",
        titleCl: "text-red-800",
        bodyCl:  "text-red-700",
        btnCl:   "bg-red-600 hover:bg-red-700 text-white",
      };

    case "near-limit":
      return {
        icon:    "⚠️",
        title:   "נותר חוזה אחד בלבד החודש",
        body:    `המסלול ${data.planLabel} מאפשר ${data.monthlyDocLimit} חוזים בחודש. שדרג כדי להמשיך לעבוד בלי הגבלות.`,
        cta:     "שדרג מסלול",
        bg:      "bg-yellow-50 border-yellow-200",
        titleCl: "text-yellow-800",
        bodyCl:  "text-yellow-700",
        btnCl:   "bg-yellow-600 hover:bg-yellow-700 text-white",
      };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function UpgradeBanner({ data }: { data: UsageData | null }) {
  if (!data) return null;

  const variant = getBannerVariant(data);
  if (!variant) return null;

  const copy = getVariantCopy(data, variant);

  return (
    <div
      dir="rtl"
      className={`flex items-start sm:items-center gap-3 rounded-xl border px-4 py-3 mb-5 ${copy.bg}`}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <span className="text-xl shrink-0 mt-0.5 sm:mt-0" aria-hidden="true">
        {copy.icon}
      </span>

      {/* Copy */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${copy.titleCl}`}>{copy.title}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${copy.bodyCl}`}>{copy.body}</p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={navigateToUpgrade}
        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${copy.btnCl}`}
      >
        {copy.cta}
      </button>
    </div>
  );
}
