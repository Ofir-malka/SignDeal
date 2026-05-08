import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_BASE_URL ?? "https://www.signdeal.co.il";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
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
