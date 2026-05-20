/**
 * Sentry Edge runtime SDK configuration.
 *
 * Loaded via src/instrumentation.ts when process.env.NEXT_RUNTIME === "edge".
 * This covers the Next.js middleware (src/middleware.ts / auth proxy) running
 * in Vercel's Edge Network.
 *
 * Rules:
 *   • No tracing — Edge functions are very high-frequency; tracing would be
 *     prohibitively expensive and noisy.
 *   • Errors only — if the auth middleware crashes, Sentry captures it.
 *   • Disabled outside production — edge functions run on every request,
 *     so keeping this off in dev/staging reduces noise significantly.
 *   • The Edge runtime has a subset of Node.js APIs; no `fs`, no `crypto`
 *     beyond the Web Crypto API. Keep this config minimal.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment: process.env.SENTRY_ENVIRONMENT ?? "development",

  // No performance tracing on the Edge — volume is too high.
  tracesSampleRate: 0,

  // Only capture errors in production to avoid noise.
  enabled: process.env.SENTRY_ENVIRONMENT === "production",

  // ── PII scrubbing ─────────────────────────────────────────────────────────
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
