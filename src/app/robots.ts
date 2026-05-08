import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_BASE_URL ?? "https://www.signdeal.co.il";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Only the legal section is publicly crawlable.
        // Everything else is behind authentication and should not be indexed.
        allow:     ["/legal/"],
        disallow:  [
          "/api/",
          "/contracts/",
          "/clients/",
          "/payments/",
          "/properties/",
          "/settings/",
          "/deals/",
          "/onboarding/",
          "/pay/",
          "/login",
          "/register",
          "/",
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
