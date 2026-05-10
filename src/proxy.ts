/**
 * Next.js Edge Middleware (proxy.ts — Next.js uses this file as the middleware
 * entry point for this project instead of middleware.ts).
 *
 * Auth.js v5 JWT strategy: reads the session JWT from the cookie (no DB hit).
 * Uses only `lib/auth.config.ts` (edge-safe — no Prisma, no bcrypt).
 *
 * Rules:
 *  • /  (root)             → unauthenticated: serve marketing homepage
 *                            authenticated + complete: redirect to /dashboard
 *                            authenticated + incomplete: fall through to rule 3
 *  • Public prefixes       → always pass through (no auth check)
 *  • No session            → redirect to /login?callbackUrl=<path>
 *  • profileComplete=false → redirect to /onboarding (unless already there)
 *  • profileComplete=true  → redirect away from /onboarding to /dashboard
 *
 * Note: all /api/ routes are excluded from the matcher — they manage their
 * own auth via requireUserId(). The Rapyd webhook and Auth.js callbacks
 * are therefore unaffected by this middleware.
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
  "/legal",          // /legal/terms, /legal/privacy, /legal/cookies
  "/pay",            // /pay/complete (client-facing payment result page)
  "/pricing",        // future public pricing page
  "/contracts/sign", // public contract signing links sent to clients
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
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
    // Admin user: fall through so the profile-completeness checks can also run
  }

  // ── 0. Root path — special case ───────────────────────────────────────────
  // Cannot add "/" to PUBLIC_PREFIXES (it would match every path).
  // Unauthenticated users see the marketing homepage at /.
  // Authenticated users with a complete profile go directly to /dashboard.
  // Authenticated users with an incomplete profile fall through to rule 3
  // which redirects them to /onboarding.
  if (pathname === "/") {
    if (!req.auth?.user) return NextResponse.next();
    if (req.auth.user.profileComplete) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // profileComplete=false → fall through to rule 3 below
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

  // ── 4. Profile complete, trying to re-visit /onboarding → /dashboard ──────
  // Direct to /dashboard rather than / to avoid a second middleware hop.
  if (req.auth.user.profileComplete && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
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
