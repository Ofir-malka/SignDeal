/**
 * (marketing) route group layout — passthrough.
 *
 * Wraps all public-facing pages: homepage, pricing, login, register,
 * onboarding, and the client-facing pay/complete page.
 *
 * Intentionally minimal for now — each page renders its own full design.
 * Shared marketing nav + footer will be promoted here once the homepage
 * has enough content to justify a shared shell.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
