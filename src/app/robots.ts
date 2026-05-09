import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_BASE_URL ?? "https://www.signdeal.co.il";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Public marketing pages are crawlable; everything else is private.
        // /pricing will be added to allow once the route exists.
        allow:    ["/", "/legal/"],
        disallow: [
          "/api/",
          "/dashboard",
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
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
