import type { Metadata } from "next";

import { NavBar }            from "@/components/marketing/NavBar";
import { HeroSection }       from "@/components/marketing/HeroSection";
import { TrustStrip }        from "@/components/marketing/TrustStrip";
import { ProblemSection }    from "@/components/marketing/ProblemSection";
import { FeaturesGrid }      from "@/components/marketing/FeaturesGrid";
import { HowItWorks }        from "@/components/marketing/HowItWorks";
import { FeatureSpotlight }  from "@/components/marketing/FeatureSpotlight";
import { PricingSection }    from "@/components/marketing/PricingSection";
import { FAQSection }        from "@/components/marketing/FAQSection";
import { MarketingFooter }   from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title:       "SignDeal – ניהול חוזים לסוכני נדל\"ן",
  description: "פלטפורמה לניהול חוזי תיווך, חתימות דיגיטליות וגביית עמלות לסוכני נדל\"ן בישראל.",
  robots:      { index: true, follow: true },
};

/**
 * Public marketing homepage.
 *
 * Authenticated users are redirected to /dashboard by proxy.ts before
 * this page renders.
 *
 * Sections implemented:
 *  ✓ NavBar
 *  ✓ HeroSection
 *  ✓ TrustStrip
 *  ✓ ProblemSection
 *  ✓ FeaturesGrid
 *  ✓ HowItWorks
 *  ✓ FeatureSpotlight
 *  ✓ PricingSection
 *  ✓ FAQSection
 *  ✓ MarketingFooter
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-indigo-950 overflow-x-hidden">
      <NavBar />
      <HeroSection />
      <TrustStrip />
      <ProblemSection />
      <FeaturesGrid />
      <HowItWorks />
      <FeatureSpotlight />
      <PricingSection />
      <FAQSection />
      <MarketingFooter />
    </div>
  );
}
