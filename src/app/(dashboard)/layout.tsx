import type { Metadata } from "next";

/**
 * (dashboard) route group layout.
 *
 * All authenticated app pages (/dashboard, /contracts, /clients, /payments,
 * /properties, /deals, /settings) inherit noindex from here, reinforcing the
 * root layout default and making the intent explicit at the group level.
 *
 * No visual shell here — each page continues to wrap itself with
 * <DashboardShell>. That refactor is a separate future step.
 */
export const metadata: Metadata = {
  robots: {
    index:     false,
    follow:    false,
    googleBot: { index: false, follow: false },
  },
};

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
