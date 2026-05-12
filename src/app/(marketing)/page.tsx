import type { Metadata } from "next";

import { NavBar }              from "@/components/marketing/NavBar";
import { HeroSection }         from "@/components/marketing/HeroSection";
import { TrustStrip }          from "@/components/marketing/TrustStrip";
import { ProblemSection }      from "@/components/marketing/ProblemSection";
import { ComparisonSection }   from "@/components/marketing/ComparisonSection";
import { FeaturesGrid }        from "@/components/marketing/FeaturesGrid";
import { HowItWorks }          from "@/components/marketing/HowItWorks";
import { ProductShowcase }     from "@/components/marketing/ProductShowcase";
import { FeatureSpotlight }    from "@/components/marketing/FeatureSpotlight";
import { SocialProof }         from "@/components/marketing/SocialProof";
import { PaymentSpotlight }    from "@/components/marketing/PaymentSpotlight";
import { LegalTrustSection }   from "@/components/marketing/LegalTrustSection";
import { PricingSection }      from "@/components/marketing/PricingSection";
import { FAQSection }          from "@/components/marketing/FAQSection";
import { FinalCTA }            from "@/components/marketing/FinalCTA";
import { MarketingFooter }     from "@/components/marketing/MarketingFooter";
import { MobileStickyCTA }     from "@/components/marketing/MobileStickyCTA";

// ── Page constants ─────────────────────────────────────────────────────────────
const SITE_URL    = "https://www.signdeal.co.il";
const TITLE       = "SignDeal | חוזי תיווך דיגיטליים — חתימה, גבייה וניהול עסקאות לסוכני נדל״ן";
const DESCRIPTION =
  "צרו חוזי תיווך בשניות, שלחו לחתימה דיגיטלית ב-SMS, וגבו עמלות בכרטיס אשראי — " +
  "הכל בפלטפורמה אחת לסוכני נדל״ן בישראל. ניסיון חינם, ללא כרטיס אשראי.";

// ── Metadata ───────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title:       TITLE,
  description: DESCRIPTION,
  keywords:    [
    "חוזי תיווך דיגיטליים",
    "חוזה תיווך מקרקעין",
    "חתימה אלקטרונית נדל\"ן",
    "גביית עמלות תיווך",
    "גביית עמלות מהנייד",
    "ניהול חוזים נדל\"ן",
    "תוכנת ניהול חוזים מתווכים",
    "חתימה דיגיטלית מתווכים",
    "מתווכי נדל\"ן ישראל",
    "בלעדיות נדל\"ן חוזה",
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
    images: [{
      url:    `${SITE_URL}/og-image.png`,
      width:  1200,
      height: 630,
      alt:    "SignDeal — חוזי תיווך דיגיטליים לסוכני נדל״ן בישראל",
    }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       TITLE,
    description: DESCRIPTION,
    images:      [`${SITE_URL}/og-image.png`],
  },
};

// ── JSON-LD structured data ────────────────────────────────────────────────────
//
// Two schemas injected together as a @graph:
//
//  1. SoftwareApplication — helps Google understand the product category;
//     may generate app-listing rich results (price, category, platform).
//
//  2. FAQPage — eligible for FAQ rich results in Google SERPs (expandable
//     Q&A directly in search). Only top-level FAQs included to avoid
//     keyword-stuffing; Google recommends < 10 entries per page.
//
// Canonical URL matches the alternates.canonical above.
// inLanguage "he-IL" signals Hebrew content to search engines.

const FAQ_STRUCTURED = [
  {
    q: "האם SignDeal מחליף ייעוץ משפטי?",
    a: "לא. SignDeal היא פלטפורמת עבודה לסוכני נדל״ן ואינה מהווה ייעוץ משפטי. לכל שאלה משפטית פנו לעו״ד מוסמך.",
  },
  {
    q: "האם חתימה דיגיטלית על חוזה תיווך חוקית בישראל?",
    a: "כן. חוק חתימה אלקטרונית (2001) מכיר בחתימות דיגיטליות. חוזי תיווך נחתמים דיגיטלית בישראל מדי יום.",
  },
  {
    q: "כמה זמן לוקח להתחיל לעבוד עם SignDeal?",
    a: "פחות מ-10 דקות. נרשמים, מגדירים פרטים, בוחרים תבנית ושולחים את החוזה הראשון ללקוח.",
  },
  {
    q: "האם הלקוח שלי צריך להתקין אפליקציה?",
    a: "לא. הלקוח מקבל SMS עם לינק, פותח בדפדפן הרגיל שלו, קורא את החוזה וחותם עם האצבע. ללא הורדות.",
  },
  {
    q: "איך עובד תהליך התשלום?",
    a: "אנחנו עובדים עם Rapyd, פלטפורמת תשלומים מורשית ומפוקחת. הלקוח משלם בכרטיס אשראי דרך לינק מאובטח.",
  },
  {
    q: "האם ניתן לבטל את המנוי בכל עת?",
    a: "כן. ביטול בלחיצה אחת, ללא קנסות ולא תקופות מחייבות.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type":              "SoftwareApplication",
      name:                 "SignDeal",
      applicationCategory:  "BusinessApplication",
      operatingSystem:      "Web",
      inLanguage:           "he-IL",
      url:                  SITE_URL,
      description:          DESCRIPTION,
      featureList: [
        "חוזי תיווך דיגיטליים",
        "חתימה אלקטרונית ב-SMS",
        "גביית עמלות בכרטיס אשראי",
        "לוח בקרה למתווכים",
        "תזכורות אוטומטיות",
      ],
      offers: {
        "@type":       "Offer",
        price:         "0",
        priceCurrency: "ILS",
        description:   "תוכנית Starter חינמית לתמיד",
      },
      publisher: {
        "@type": "Organization",
        name:    "SignDeal",
        url:     SITE_URL,
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_STRUCTURED.map(({ q, a }) => ({
        "@type": "Question",
        name:    q,
        acceptedAnswer: {
          "@type": "Answer",
          text:    a,
        },
      })),
    },
  ],
};

/**
 * Public marketing homepage.
 * Authenticated users are redirected to /dashboard by middleware.
 *
 * Sections (Phase 6 order):
 *  ✓ NavBar
 *  ✓ HeroSection         — contract-lifecycle mock UI
 *  ✓ TrustStrip          — 4 concrete workflow signals
 *  ✓ ProblemSection
 *  ✓ ComparisonSection   — before/after old vs SignDeal
 *  ✓ FeaturesGrid
 *  ✓ HowItWorks          — gradient badges, GlassCard steps, detail chips
 *  ✓ ProductShowcase     — 4-panel interactive product walkthrough
 *  ✓ FeatureSpotlight    — 4 deep-dive blocks with mock UIs
 *  ✓ SocialProof         — 3 broker testimonials
 *  ✓ PaymentSpotlight    — fee-collection hook + flow mock
 *  ✓ LegalTrustSection   — NEW: trust/security/compliance for Israeli brokers
 *  ✓ PricingSection
 *  ✓ FAQSection          — 3 new Qs: legal disclaimer, existing contracts, audit log
 *  ✓ FinalCTA            — layered glows, gradient headline, stronger buttons
 *  ✓ MarketingFooter
 *  ✓ MobileStickyCTA     — fixed bottom bar, mobile-only
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
        <ProductShowcase />
        <FeatureSpotlight />
        <SocialProof />
        <PaymentSpotlight />
        <LegalTrustSection />
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
