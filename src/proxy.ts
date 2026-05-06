import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Initialise Auth.js with the edge-safe config only — no Prisma, no bcrypt.
const { auth } = NextAuth(authConfig);

// Pages always accessible regardless of auth state or profile completeness
const PUBLIC_PAGES = new Set(["/login", "/register", "/onboarding"]);

// Page path prefixes always accessible (public contract signing)
const PUBLIC_PAGE_PREFIXES = ["/contracts/sign/"];

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // Public pages — always allow
  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p)))
    return NextResponse.next();

  // Not authenticated → /login
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Authenticated but profile incomplete → /onboarding
  if (!req.auth.user?.profileComplete) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on all page routes; exclude Next.js internals, static assets, and
    // ALL /api/ routes — API routes manage their own auth via requireUserId().
    "/((?!_next/static|_next/image|favicon\\.ico|api/).*)",
  ],
};
