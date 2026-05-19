import type { NextConfig } from "next";

// ── Security headers ──────────────────────────────────────────────────────────
//
// Applied to every response via the headers() array.
//
// CSP is deliberately permissive on connect-src and frame-src to avoid breaking:
//   - Stripe Checkout / Stripe.js (js.stripe.com, hooks.stripe.com, checkout.stripe.com)
//   - HYP payment page (pay.hyp.co.il) — opened in a browser redirect, not a frame
//   - Auth.js OAuth redirects (accounts.google.com, appleid.apple.com)
//   - Resend email webhooks, Vercel analytics
//
// Inline scripts in Next.js App Router require 'unsafe-inline' for now because
// Next.js injects bootstrap scripts without a nonce in this version.
// A nonce-based CSP is a Phase 3 hardening item.
//
const securityHeaders = [
  // Prevent browsers from MIME-sniffing the content type
  { key: "X-Content-Type-Options",  value: "nosniff" },

  // Deny framing entirely — no clickjacking
  { key: "X-Frame-Options",         value: "DENY" },

  // Force HTTPS for 2 years; include subdomains
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },

  // Never send the full URL as Referer to third parties
  { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },

  // Disable sensitive browser features not used by this app
  {
    key:   "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=()",
  },

  // Content Security Policy
  // — default-src 'self': baseline; everything not listed here falls back to 'self'
  // — script-src: Next.js requires 'unsafe-inline' until nonce-CSP is implemented
  // — style-src: Tailwind inlines styles; 'unsafe-inline' required
  // — img-src: allow data: URIs (signatures), blob:, and any https origin (avatars, logos)
  // — connect-src: Stripe, HYP, Vercel, self
  // — frame-src / frame-ancestors: block all framing
  {
    key:   "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://pay.hyp.co.il https://*.vercel-insights.com",
      "frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],

  async headers() {
    return [
      {
        // Apply to every route
        source:  "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
