"use client";

/**
 * GrowOnboardingScreen — dedicated full-page Grow onboarding screen.
 *
 * Reads { sessionId, formUrl } from sessionStorage (written by GrowLaunchForm),
 * renders the real Grow iframe large/full-area, and handles Grow's postMessage:
 *   success → clear sessionStorage + return to /settings/payments/grow?submitted=1
 *   close   → return to /settings/payments/grow
 *
 * If there is no launch data (direct hit / new tab / expired), shows a safe
 * "start over" prompt — never errors, never exposes anything.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GrowOnboardingIframe } from "../GrowOnboardingIframe";
import { readGrowLaunch, clearGrowLaunch, type GrowLaunchData } from "../onboardingLaunch";

export function GrowOnboardingScreen() {
  const router = useRouter();
  const [state, setState] = useState<{ ready: boolean; launch: GrowLaunchData | null }>({
    ready: false,
    launch: null,
  });

  useEffect(() => {
    // One-time, SSR-safe read of client-only sessionStorage after mount (it cannot be
    // read during render/SSR). Intentional single state sync — not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ ready: true, launch: readGrowLaunch() });
  }, []);

  const { ready, launch } = state;

  const handleSuccess = useCallback(() => {
    clearGrowLaunch();
    router.push("/settings/payments/grow?submitted=1");
  }, [router]);

  const handleClose = useCallback(() => {
    router.push("/settings/payments/grow");
  }, [router]);

  if (!ready) {
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!launch) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-6 text-center space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          לא נמצאו פרטי הרשמה פעילים. יש להתחיל את החיבור ל-Grow מחדש.
        </p>
        <Link
          href="/settings/payments/grow"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          חזרה לחיבור Grow
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 leading-relaxed">
          מלא/י את טופס ההרשמה של Grow. עם הסיום נחזור אוטומטית לעמוד הסטטוס.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          סגירה
        </button>
      </div>
      <GrowOnboardingIframe formUrl={launch.formUrl} onSuccess={handleSuccess} onClose={handleClose} />
    </div>
  );
}
