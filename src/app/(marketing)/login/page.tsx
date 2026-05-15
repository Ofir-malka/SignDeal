import type { Metadata } from "next";
import { Suspense }     from "react";
import { LoginForm }    from "./LoginForm";

export const metadata: Metadata = {
  title:       "התחברות",
  description: "התחבר לחשבון SignDeal לניהול חוזי התיווך שלך.",
};

// Server component — checks env vars at request time (never exposed to client bundle).
// Both ID and SECRET must be present before a provider button is shown,
// mirroring the conditional provider registration in auth.ts.
//
// Suspense is required here because LoginForm uses useSearchParams() to read
// the ?reset=success query param.  Without a boundary Next.js deopts the page
// from static prerender, which can interfere with client-side navigation.
export default function LoginPage() {
  const googleEnabled =
    !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  const appleEnabled =
    !!process.env.AUTH_APPLE_ID && !!process.env.AUTH_APPLE_SECRET;

  return (
    <Suspense fallback={null}>
      <LoginForm googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
    </Suspense>
  );
}
