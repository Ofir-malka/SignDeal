import type { Metadata } from "next";

import { NavBar }          from "@/components/marketing/NavBar";
import { PricingSection }  from "@/components/marketing/PricingSection";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { auth }            from "@/lib/auth";

export const metadata: Metadata = {
  title:       "מחירים | SignDeal",
  description: "בחר את המסלול המתאים לך — Starter בחינם או Pro ללא הגבלות. ניסיון חינם ל-14 יום.",
  robots:      { index: true, follow: true },
};

/**
 * Public standalone pricing page.
 *
 * Reuses PricingSection — checks auth server-side so logged-in users get
 * checkout CTAs directly instead of being sent to /register.
 *
 * This route is in proxy.ts PUBLIC_PREFIXES so authenticated users are NOT
 * redirected to /dashboard when landing here from an upgrade CTA.
 */
export default async function PricingPage() {
  const session   = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white" dir="rtl">
      <NavBar />

      {/* Spacer for the fixed NavBar (~72px tall) */}
      <div className="pt-20 sm:pt-24">
        <PricingSection isLoggedIn={isLoggedIn} />
      </div>

      <MarketingFooter />
    </div>
  );
}
