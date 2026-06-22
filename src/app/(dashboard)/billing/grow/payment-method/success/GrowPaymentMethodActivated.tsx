"use client";

/**
 * GrowPaymentMethodActivated — client half of the card-update / recovery bridge for the
 * IMMEDIATE-success case. The card was already re-sealed server-side (verifyAndApplyGrowCardUpdate).
 * Its only job: refresh the session JWT (recovery flipped status to ACTIVE → the cookie is stale)
 * then navigate to /settings/billing. NEVER touches token / processToken / apiKey.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export function GrowPaymentMethodActivated() {
  const router = useRouter();
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
      router.replace("/settings/billing");
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
        <h1 className="text-base font-semibold text-gray-900">מעדכן את אמצעי התשלום…</h1>
      </div>
    </main>
  );
}
