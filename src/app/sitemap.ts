import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_BASE_URL ?? "https://www.signdeal.co.il";

/**
 * XML sitemap — only publicly-indexable pages.
 *
 * Excluded intentionally:
 *  • All dashboard/app routes (/dashboard, /contracts, /clients, etc.)
 *  • Auth pages (/login, /register, /onboarding)
 *  • Client-facing utility pages (/contracts/sign/*, /pay/complete)
 *  • /pricing — add when the pricing page route is created
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Marketing homepage ────────────────────────────────────────────────
    {
      url:             `${APP_URL}/`,
      lastModified:    new Date("2025-05-01"),
      changeFrequency: "monthly",
      priority:        1.0,
    },

    // ── Legal pages ───────────────────────────────────────────────────────
    // Lower priority than marketing pages — valuable for trust, not acquisition.
    {
      url:             `${APP_URL}/legal/terms`,
      lastModified:    new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority:        0.4,
    },
    {
      url:             `${APP_URL}/legal/privacy`,
      lastModified:    new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority:        0.4,
    },
    {
      url:             `${APP_URL}/legal/cookies`,
      lastModified:    new Date("2025-01-01"),
      changeFrequency: "yearly",
      priority:        0.3,
    },
  ];
}
