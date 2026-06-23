"use client";

/**
 * GrowPaymentMethodVerifying — client half of the card-update / recovery bridge, shown ONLY
 * when the first server verification came back pending or failed. On "pending" it polls
 * POST /api/billing/grow/payment-method/verify a few times; on "applied" it refreshes the JWT
 * and replaces to /settings/billing; on failure it shows a safe error + retry. It NEVER
 * applies anything itself — the server bridge does, behind getPaymentProcessInfo verification.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const POLL_MS = 3000;
const MAX_ATTEMPTS = 5;

type State = "pending" | "failed" | "timeout";

export function GrowPaymentMethodVerifying({ initialState }: { initialState: "pending" | "failed" }) {
  const router = useRouter();
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
        const res = await fetch("/api/billing/grow/payment-method/verify", { method: "POST", credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as { state?: string };
        if (cancelled) return;
        if (json.state === "applied") {
          clearInterval(id);
          await updateRef.current({ refreshSubscription: true });
          if (!cancelled) router.replace("/settings/billing");
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
            <h1 className="text-base font-semibold text-gray-900">מעדכן את אמצעי התשלום…</h1>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              אל תסגור/י את החלון — האימות מול Grow יסתיים בעוד רגע.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-base font-semibold text-gray-900">
              {state === "failed" ? "העדכון נכשל" : "העדכון נמשך זמן רב מהצפוי"}
            </h1>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              {state === "failed"
                ? "לא הצלחנו לעדכן את אמצעי התשלום. ניתן לנסות שוב."
                : "העדכון עדיין לא הושלם. נסה/י לרענן או לחזור להגדרות."}
            </p>
            <a
              href="/settings/billing"
              className="mt-5 inline-flex items-center justify-center w-full px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              חזרה להגדרות החיוב
            </a>
          </>
        )}
      </div>
    </main>
  );
}
