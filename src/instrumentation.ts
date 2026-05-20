/**
 * Next.js Instrumentation Hook
 *
 * This file is loaded ONCE per runtime startup by Next.js before any route
 * handler runs. It is the correct place to initialize global singleton services
 * like Sentry — not inside individual route files or middleware.
 *
 * Next.js calls register() in two distinct runtimes:
 *   "nodejs"  — all API routes, Server Components, server actions (most of the app)
 *   "edge"    — src/middleware.ts and any routes using `export const runtime = "edge"`
 *
 * We load a separate Sentry config per runtime because:
 *   • Node.js runtime has full Node.js APIs (crypto, fs, etc.)
 *   • Edge runtime has only the Web Platform APIs subset
 *   • Trace sample rates differ (Edge is higher-volume → traces disabled)
 *
 * References:
 *   https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
