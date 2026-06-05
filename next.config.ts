import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
  // — frame-src: Stripe + the Grow onboarding form (dev.register.meshulam.co.il);
  //   frame-ancestors 'none': we are never framed by others
  {
    key:   "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://pay.hyp.co.il https://*.vercel-insights.com",
      "frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://dev.register.meshulam.co.il",
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

// ── Sentry ────────────────────────────────────────────────────────────────────
//
// withSentryConfig() wraps the Next.js config to:
//   1. Auto-instrument Server Components and API routes (via instrumentation.ts)
//   2. Upload source maps to Sentry at build time (requires SENTRY_AUTH_TOKEN)
//   3. Add the tunnel route at /monitoring so Sentry events bypass ad-blockers
//      and stay on our own domain (no extra CSP rules needed — 'self' covers it)
//
// Turbopack note: the Sentry webpack plugin that uploads source maps does not
// run under Turbopack. Source maps can be uploaded separately via `sentry-cli`
// in the CI pipeline using SENTRY_AUTH_TOKEN. Runtime error capturing works
// correctly with Turbopack in both dev and production.
//
// tunnelRoute: "/monitoring" — Sentry automatically creates this Next.js API
// route. The existing CSP `connect-src 'self'` already allows same-origin
// requests, so no CSP changes are required.

export default withSentryConfig(nextConfig, {
  // ── Build-time source map upload ──────────────────────────────────────────
  org:       process.env.SENTRY_ORG,
  project:   process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress upload output in local builds; CI gets the verbose log.
  silent: !process.env.CI,

  // ── Tunnel route ──────────────────────────────────────────────────────────
  // Routes Sentry SDK requests through /monitoring (same origin as the app)
  // so they are not blocked by ad-blockers and pass the existing CSP.
  // The existing connect-src 'self' covers same-origin requests — no new
  // CSP entries are required.
  tunnelRoute: "/monitoring",

  // ── Webpack-specific options (v10 API) ────────────────────────────────────
  webpack: {
    // Tree-shake Sentry's internal debug logger out of production bundles.
    // v10 equivalent of the deprecated `disableLogger` top-level option.
    treeshake: {
      removeDebugLogging: true,
    },
    // Disable automatic Vercel Cron Monitor creation — we will configure
    // Sentry Cron Monitors manually in Phase B with explicit thresholds.
    // v10 equivalent of the deprecated `automaticVercelMonitors` top-level option.
    automaticVercelMonitors: false,
  },

  // ── Source maps ───────────────────────────────────────────────────────────
  // Delete uploaded source maps from the build output so they are never
  // served to browsers (they would expose original source code).
  // v10 equivalent of the deprecated `hideSourceMaps` top-level option.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
