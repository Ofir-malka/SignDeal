import type { Metadata } from "next";

import { NavBar }          from "@/components/marketing/NavBar";
import { PricingSection }  from "@/components/marketing/PricingSection";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title:       "מחירים | SignDeal",
  description: "בחר את המסלול המתאים לך — Starter בחינם או Pro ללא הגבלות. ניסיון חינם ל-14 יום.",
  robots:      { index: true, follow: true },
};

/**
 * Public standalone pricing page.
 *
 * Reuses the existing PricingSection component — no billing logic here.
 * This route is in proxy.ts PUBLIC_PREFIXES so authenticated users are
 * NOT redirected to /dashboard when landing here from the upgrade CTA.
 */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white" dir="rtl">
      <NavBar />

      {/* Spacer for the fixed NavBar (~72px tall) */}
      <div className="pt-20 sm:pt-24">
        <PricingSection />
      </div>

      <MarketingFooter />
    </div>
  );
}
