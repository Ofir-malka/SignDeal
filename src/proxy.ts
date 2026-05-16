/**
 * Next.js Edge Middleware (proxy.ts — Next.js uses this file as the middleware
 * entry point for this project instead of middleware.ts).
 *
 * Auth.js v5 JWT strategy: reads the session JWT from the cookie (no DB hit).
 * Uses only `lib/auth.config.ts` (edge-safe — no Prisma, no bcrypt).
 *
 * Rules (in order):
 *  1. /admin               → must have ADMIN role; otherwise /login or /dashboard
 *  0. / (root)             → unauthenticated: serve marketing homepage
 *                            authenticated + profileComplete + ACTIVE/TRIALING: /dashboard
 *                            authenticated + profileComplete + INCOMPLETE: /onboarding/billing
 *                            authenticated + !profileComplete: fall through to rule 3
 *  1. Public prefixes      → always pass through (no auth check)
 *  2. No session           → redirect to /login?callbackUrl=<path>
 *  3. profileComplete=false → /onboarding (unless already there)
 *  3b. INCOMPLETE status   → /onboarding/billing (unless on an INCOMPLETE-allowed path)
 *       INCOMPLETE-allowed: /onboarding/billing, /billing/success, /billing/error,
 *                           /settings/billing
 *       Admins bypass this rule — they keep full access regardless of status.
 *  4. profileComplete=true on /onboarding → /onboarding/billing (if INCOMPLETE)
 *                                         → /dashboard (otherwise)
 *
 * Note: all /api/ routes are excluded from the matcher — they manage their
 * own auth via requireUserId(). Auth.js callbacks and billing routes are
 * therefore unaffected by this middleware.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Initialise Auth.js with the edge-safe config only — no Prisma, no bcrypt.
const { auth } = NextAuth(authConfig);

/**
 * Path prefixes that are always accessible, regardless of auth state.
 * Exact match OR starts-with-prefix+"/" both count as public.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password", // password-reset request form — must be accessible unauthenticated
  "/reset-password",  // password-reset form (/reset-password?token=...) — same
  "/legal",           // /legal/terms, /legal/privacy, /legal/cookies
  "/pay",             // /pay/complete (client-facing payment result page)
  "/pricing",         // public pricing page
  "/contracts/sign",  // public contract signing links sent to clients
];

/**
 * Paths that INCOMPLETE users (no card yet) are allowed to visit.
 * Everything else redirects them to /onboarding/billing.
 * Admins bypass this list entirely.
 */
const INCOMPLETE_ALLOWED_PREFIXES = [
  "/onboarding/billing", // billing onboarding — pick plan + enter card
  "/billing/success",    // HYP success redirect
  "/billing/error",      // HYP error redirect
  "/settings/billing",   // fallback: users who navigate here directly can still subscribe
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isIncompleteAllowed(pathname: string): boolean {
  return INCOMPLETE_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Admin paths — fast role guard ─────────────────────────────────────────
  // JWT role is checked here for a fast redirect; the real security enforcement
  // happens server-side in the admin layout (server component) and every admin
  // API route (requireAdmin() re-queries the DB every time).
  if (pathname.startsWith("/admin")) {
    if (!req.auth?.user) {
      // Not authenticated → /login with callbackUrl preserved
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (req.auth.user.role !== "ADMIN") {
      // Authenticated but not an admin → bounce to dashboard
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // Admin user: fall through — admins bypass INCOMPLETE check further below
  }

  // ── 0. Root path — special case ───────────────────────────────────────────
  // Cannot add "/" to PUBLIC_PREFIXES (it would match every path).
  if (pathname === "/") {
    if (!req.auth?.user) return NextResponse.next(); // unauthenticated → homepage
    if (!req.auth.user.profileComplete) {
      // Fall through to rule 3 → /onboarding
    } else if (
      req.auth.user.subscriptionStatus === "INCOMPLETE" &&
      req.auth.user.role !== "ADMIN"
    ) {
      return NextResponse.redirect(new URL("/onboarding/billing", req.url));
    } else {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // ── 1. Public paths — no auth check ──────────────────────────────────────
  if (isPublicPath(pathname)) return NextResponse.next();

  // ── 2. Not authenticated → redirect to /login ─────────────────────────────
  if (!req.auth?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // ── 3. Authenticated, profile incomplete → /onboarding ───────────────────
  if (!req.auth.user.profileComplete && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // ── 3b. INCOMPLETE subscription → /onboarding/billing ────────────────────
  // profileComplete is guaranteed true at this point (rule 3 would have fired).
  // Admins are exempt — they retain full dashboard access regardless of status.
  if (
    req.auth.user.subscriptionStatus === "INCOMPLETE" &&
    req.auth.user.role !== "ADMIN" &&
    !isIncompleteAllowed(pathname)
  ) {
    return NextResponse.redirect(new URL("/onboarding/billing", req.url));
  }

  // ── 4. Profile complete, trying to re-visit /onboarding ───────────────────
  // Direct to /onboarding/billing for INCOMPLETE users (avoids a second hop),
  // or to /dashboard for users whose subscription is already active/trialing.
  if (req.auth.user.profileComplete && pathname === "/onboarding") {
    const dest =
      req.auth.user.subscriptionStatus === "INCOMPLETE" &&
      req.auth.user.role !== "ADMIN"
        ? "/onboarding/billing"
        : "/dashboard";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on all page routes; exclude Next.js internals, static assets, and
    // ALL /api/ routes — API routes manage their own auth via requireUserId().
    "/((?!_next/static|_next/image|favicon\\.ico|og-image\\.png|fonts/|api/).*)",
  ],
};
