"use client";

/**
 * GrowActivated — the client half of the Grow Rail A bridge for the IMMEDIATE-success
 * case. By the time this renders, verifyAndActivateGrowTokenSetup has ALREADY moved the
 * subscription INCOMPLETE → TRIALING in the DB (server-side). Its only job is to refresh
 * the session JWT, then navigate to /dashboard.
 *
 * Why the refresh is required: the edge middleware (proxy.ts) reads subscriptionStatus
 * from the JWT cookie only (no DB hit). Without a refresh the cookie still says
 * INCOMPLETE, so every navigation to /dashboard bounces back to /onboarding/billing.
 * update({ refreshSubscription: true }) triggers the auth.ts jwt callback to re-read the
 * subscription and write TRIALING into the cookie — same mechanism as HYP's DashboardLink,
 * but fired automatically instead of on click.
 *
 * NEVER touches token / processToken / apiKey — it only flips the session's cached status.
 */

import { useEffect, useRef } from "react";
import { useRouter }  from "next/navigation";
import { useSession } from "next-auth/react";

export function GrowActivated() {
  const router     = useRouter();
  const { update } = useSession();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // run exactly once (StrictMode / re-render safe)
    startedRef.current = true;
    const go = async () => {
      try {
        await update({ refreshSubscription: true });
      } catch {
        /* non-fatal — the full navigation below re-issues the JWT anyway */
      }
      router.replace("/dashboard");
    };
    void go();
  }, [update, router]);

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin"
          aria-hidden="true"
        />
        <h1 className="text-base font-semibold text-gray-900">מפעיל את החשבון…</h1>
      </div>
    </main>
  );
}
