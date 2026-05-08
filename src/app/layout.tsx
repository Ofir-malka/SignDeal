import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const APP_URL = process.env.APP_BASE_URL ?? "https://www.signdeal.co.il";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  title: {
    default: "SignDeal – ניהול חוזים לסוכני נדל\"ן",
    template: "%s | SignDeal",
  },
  description:
    "פלטפורמה מתקדמת לניהול חוזי תיווך, חתימות דיגיטליות ותשלומים לסוכני נדל\"ן בישראל.",
  keywords: ["חוזי תיווך", "חתימה דיגיטלית", "ניהול חוזים", "סוכן נדל\"ן", "SignDeal"],
  authors: [{ name: "SignDeal", url: APP_URL }],
  creator: "SignDeal",

  // App pages are auth-protected — noindex by default.
  // Legal pages (/legal/**) override this to index:true.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },

  openGraph: {
    type:        "website",
    locale:      "he_IL",
    url:         APP_URL,
    siteName:    "SignDeal",
    title:       "SignDeal – ניהול חוזים לסוכני נדל\"ן",
    description: "פלטפורמה מתקדמת לניהול חוזי תיווך, חתימות דיגיטליות ותשלומים לסוכני נדל\"ן בישראל.",
    images: [
      {
        url:    "/og-image.png",
        width:  1200,
        height: 630,
        alt:    "SignDeal – ניהול חוזים לסוכני נדל\"ן",
      },
    ],
  },

  twitter: {
    card:        "summary_large_image",
    title:       "SignDeal – ניהול חוזים לסוכני נדל\"ן",
    description: "פלטפורמה מתקדמת לניהול חוזי תיווך, חתימות דיגיטליות ותשלומים לסוכני נדל\"ן בישראל.",
    images:      ["/og-image.png"],
  },

  icons: {
    icon:     "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className={`${rubik.className} h-full`}>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
