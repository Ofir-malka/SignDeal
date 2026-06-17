"use client";

/**
 * GrowVerifying — the client half of the Grow Rail A bridge. Shown ONLY when the
 * first server verification came back pending or failed. On "pending" it polls
 * POST /api/billing/grow/verify a few times; on success it redirects to /dashboard;
 * on failure it shows a safe error + retry. It NEVER activates anything itself — the
 * server bridge does, behind getPaymentProcessInfo verification.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const POLL_MS = 3000;
const MAX_ATTEMPTS = 5;

type State = "pending" | "failed" | "timeout";

export function GrowVerifying({ initialState }: { initialState: "pending" | "failed" }) {
  const router = useRouter();
  // Latest-ref for update() so the polling effect below never restarts on its identity.
  const { update } = useSession();
  const updateRef = useRef(update);
  useEffect(() => { updateRef.current = update; }, [update]);

  const [state, setState] = useState<State>(initialState);

  useEffect(() => {
    if (state !== "pending") return;
    let cancelled = false;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/billing/grow/verify", { method: "POST", credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as { state?: string };
        if (cancelled) return;
        if (json.state === "trial_started") {
          clearInterval(id);
          // Refresh the JWT so middleware sees TRIALING before navigating
          // (mirrors HYP DashboardLink); otherwise /dashboard bounces to onboarding.
          await updateRef.current({ refreshSubscription: true });
          if (!cancelled) router.replace("/dashboard");
          return;
        }
        if (json.state === "failed") {
          clearInterval(id);
          setState("failed");
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (!cancelled && attempts >= MAX_ATTEMPTS) {
        clearInterval(id);
        setState("timeout");
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, router]);

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 text-center">
        {state === "pending" ? (
          <>
            <div
              className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-gray-200 border-t-indigo-600 animate-spin"
              aria-hidden="true"
            />
            <h1 className="text-base font-semibold text-gray-900">מאמת את אמצעי התשלום…</h1>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              אל תסגור/י את החלון — האימות מול Grow יסתיים בעוד רגע.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-base font-semibold text-gray-900">
              {state === "failed" ? "האימות נכשל" : "האימות נמשך זמן רב מהצפוי"}
            </h1>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              {state === "failed"
                ? "לא הצלחנו לאמת את אמצעי התשלום. ניתן לנסות שוב."
                : "האימות עדיין לא הושלם. נסה/י לרענן או להתחיל מחדש."}
            </p>
            <a
              href="/onboarding/billing"
              className="mt-5 inline-flex items-center justify-center w-full px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              חזרה ובחירת מסלול
            </a>
          </>
        )}
      </div>
    </main>
  );
}
