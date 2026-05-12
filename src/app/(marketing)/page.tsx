import type { Metadata } from "next";

import { NavBar }              from "@/components/marketing/NavBar";
import { HeroSection }         from "@/components/marketing/HeroSection";
import { TrustStrip }          from "@/components/marketing/TrustStrip";
import { ProblemSection }      from "@/components/marketing/ProblemSection";
import { ComparisonSection }   from "@/components/marketing/ComparisonSection";
import { FeaturesGrid }        from "@/components/marketing/FeaturesGrid";
import { HowItWorks }          from "@/components/marketing/HowItWorks";
import { FeatureSpotlight }    from "@/components/marketing/FeatureSpotlight";
import { SocialProof }         from "@/components/marketing/SocialProof";
import { PaymentSpotlight }    from "@/components/marketing/PaymentSpotlight";
import { PricingSection }      from "@/components/marketing/PricingSection";
import { FAQSection }          from "@/components/marketing/FAQSection";
import { FinalCTA }            from "@/components/marketing/FinalCTA";
import { MarketingFooter }     from "@/components/marketing/MarketingFooter";
import { MobileStickyCTA }     from "@/components/marketing/MobileStickyCTA";

// ── Page constants ─────────────────────────────────────────────────────────────
const SITE_URL    = "https://www.signdeal.co.il";
const TITLE       = "SignDeal – חוזי תיווך דיגיטליים, חתימה וגבייה לסוכני נדל׳ן";
const DESCRIPTION =
  "צרו חוזי תיווך בשניות, שלחו לחתימה דיגיטלית ב-SMS, וגבו עמלות בכרטיס אשראי — " +
  "הכל בפלטפורמה אחת לסוכני נדל׳ן בישראל.";

// ── Metadata ───────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title:       TITLE,
  description: DESCRIPTION,
  keywords:    [
    "חוזי תיווך דיגיטליים",
    "חתימה אלקטרונית",
    "גביית עמלות תיווך",
    "ניהול חוזים נדל\"ן",
    "מתווכי נדל\"ן ישראל",
    "חוזה תיווך מקרקעין",
    "SignDeal",
  ],
  robots: { index: true, follow: true },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title:       TITLE,
    description: DESCRIPTION,
    url:         SITE_URL,
    siteName:    "SignDeal",
    locale:      "he_IL",
    type:        "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SignDeal" }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       TITLE,
    description: DESCRIPTION,
    images:      ["/og-image.png"],
  },
};

// ── JSON-LD structured data ────────────────────────────────────────────────────
// SoftwareApplication schema helps Google understand the product category
// and may generate rich results (star ratings, price info) in SERPs.
const jsonLd = {
  "@context":           "https://schema.org",
  "@type":              "SoftwareApplication",
  name:                 "SignDeal",
  applicationCategory:  "BusinessApplication",
  operatingSystem:      "Web",
  inLanguage:           "he-IL",
  url:                  SITE_URL,
  description:          DESCRIPTION,
  offers: {
    "@type":      "Offer",
    price:        "0",
    priceCurrency:"ILS",
    description:  "תוכנית Starter חינמית לתמיד",
  },
  publisher: {
    "@type": "Organization",
    name:    "SignDeal",
    url:     SITE_URL,
  },
};

/**
 * Public marketing homepage.
 *
 * Authenticated users are redirected to /dashboard by middleware before
 * this page renders.
 *
 * Phase 1 changes (2026-05):
 *  • Updated title, description, keywords, canonical
 *  • Added JSON-LD SoftwareApplication schema
 *
 * Sections (Phase 3 order):
 *  ✓ NavBar
 *  ✓ HeroSection         — contract-lifecycle mock UI
 *  ✓ TrustStrip          — 4 concrete workflow signals
 *  ✓ ProblemSection
 *  ✓ ComparisonSection   — NEW: before/after old vs SignDeal
 *  ✓ FeaturesGrid
 *  ✓ HowItWorks          — polished: gradient badges, GlassCard steps, detail chips
 *  ✓ FeatureSpotlight
 *  ✓ SocialProof         — 3 broker testimonials
 *  ✓ PaymentSpotlight    — fee-collection hook + flow mock
 *  ✓ PricingSection
 *  ✓ FAQSection
 *  ✓ FinalCTA            — premium: layered glows, stronger buttons
 *  ✓ MarketingFooter
 *  ✓ MobileStickyCTA     — NEW: fixed bottom bar, mobile-only
 */
export default function HomePage() {
  return (
    <>
      {/* Structured data — injected into <head> by Next.js */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-indigo-950 overflow-x-hidden">
        <NavBar />
        <HeroSection />
        <TrustStrip />
        <ProblemSection />
        <ComparisonSection />
        <FeaturesGrid />
        <HowItWorks />
        <FeatureSpotlight />
        <SocialProof />
        <PaymentSpotlight />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
        <MarketingFooter />
        {/* Mobile sticky CTA — client component, renders after hydration */}
        <MobileStickyCTA />
      </div>
    </>
  );
}
