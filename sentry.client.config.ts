/**
 * Sentry client-side (browser) SDK configuration.
 *
 * Loaded automatically by @sentry/nextjs when the browser bundle is executed.
 * Referenced from next.config.ts via withSentryConfig().
 *
 * Rules:
 *   • Session Replay is intentionally DISABLED — requires GDPR / Israeli
 *     privacy law review and explicit user consent before enabling.
 *   • PII (email, username, IP) is stripped in beforeSend so user data
 *     never leaves the browser in Sentry payloads.
 *   • NEXT_PUBLIC_SENTRY_DSN is safe to expose — it only grants permission
 *     to send events, not to read them.
 *   • Events are suppressed in development unless NEXT_PUBLIC_SENTRY_DSN
 *     is explicitly set, so local dev stays noise-free.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",

  // Sample a small fraction of traces in production to avoid cost/noise.
  // 1.0 in non-production so you see every trace during staging QA.
  tracesSampleRate:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,

  // ── Session Replay — DISABLED ─────────────────────────────────────────────
  // Do NOT enable without a privacy policy update and user-consent mechanism.
  // replaysSessionSampleRate: 0,
  // replaysOnErrorSampleRate: 0,

  // ── PII scrubbing ─────────────────────────────────────────────────────────
  // Strip identifying fields before any event leaves the browser.
  // We keep user.id (a CUID — not personally identifying) so Sentry can
  // count unique users affected by an error without knowing who they are.
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    return event;
  },

  // ── Noise suppression ─────────────────────────────────────────────────────
  // Drop events that are expected, non-actionable browser errors.
  ignoreErrors: [
    // Network interruptions — not a bug on our side
    "Network Error",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "Load failed",
    // Browser extension interference
    "Non-Error promise rejection captured",
    // Safari known quirk
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],
});
