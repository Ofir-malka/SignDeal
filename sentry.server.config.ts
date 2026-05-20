/**
 * Sentry server-side (Node.js) SDK configuration.
 *
 * Loaded via src/instrumentation.ts when process.env.NEXT_RUNTIME === "nodejs".
 * This covers all API routes, Server Components, and server actions running
 * in the Node.js runtime.
 *
 * Rules:
 *   • Never log or forward request bodies — they may contain PII or secrets.
 *   • `enabled: false` in local dev by default so the dev loop stays quiet.
 *     Set SENTRY_ENABLED_IN_DEV=true in .env.local to test Sentry locally.
 *   • SENTRY_DSN is a server-only env var (no NEXT_PUBLIC_ prefix) — it is
 *     never inlined into the browser bundle.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment: process.env.SENTRY_ENVIRONMENT ?? "development",

  // Low trace sample rate in production — API routes are high-frequency.
  // Increase temporarily when diagnosing a specific performance issue.
  tracesSampleRate:
    process.env.SENTRY_ENVIRONMENT === "production" ? 0.05 : 1.0,

  // Suppress events in local development unless opted in.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_ENABLED_IN_DEV === "true",

  // ── PII scrubbing ─────────────────────────────────────────────────────────
  // Strip identifying fields from server-side events.
  // Request bodies are NOT captured by default in @sentry/nextjs v8+,
  // but we also strip user context fields defensively.
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    // Never forward the raw request body to Sentry — it may contain
    // webhook payloads, PII, or secrets.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
