"use client";

import Link      from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 " +
  "placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

interface Props {
  /** Raw token from the URL query string. Empty string when missing. */
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState("");

  const passwordsMatch = password === confirm;
  const passwordLong   = password.length >= 8;
  const canSubmit      = passwordLong && passwordsMatch && !loading;

  // ── Invalid/missing token — show error state immediately ─────────────────
  if (!token) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  width="26" height="26" viewBox="0 0 24 24"
                  fill="none" stroke="#dc2626" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">הקישור לא תקין</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              הקישור לאיפוס הסיסמה חסר, לא תקין, או שכבר נעשה בו שימוש.
              <br />
              קישורי איפוס תקפים לשעה אחת בלבד ולשימוש חד-פעמי.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
            >
              בקש קישור איפוס חדש
            </Link>
            <Link
              href="/login"
              className="block text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              חזרה להתחברות
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Success state (after successful POST) ─────────────────────────────────
  if (success) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg
                  width="28" height="28" viewBox="0 0 24 24"
                  fill="none" stroke="#16a34a" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">הסיסמה שונתה בהצלחה!</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              הסיסמה החדשה שלך נשמרה.
              <br />
              אנא התחבר/י מחדש עם הסיסמה החדשה.
            </p>
            <button
              onClick={() => router.push("/login?reset=success")}
              className="inline-flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
            >
              התחברות
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Main reset form ───────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!passwordLong) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (!passwordsMatch) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        if (data.error === "INVALID_OR_EXPIRED") {
          setError("הקישור לא תקין או שפג תוקפו. בקש/י קישור חדש.");
        } else if (data.error === "PASSWORD_TOO_SHORT") {
          setError("הסיסמה חייבת להכיל לפחות 8 תווים");
        } else if (res.status === 429) {
          setError("יותר מדי בקשות. נסה שוב מאוחר יותר.");
        } else {
          setError("אירעה שגיאה. נסה שוב או פנה לתמיכה.");
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError("שגיאת רשת — בדוק חיבור לאינטרנט ונסה שנית");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Back to login */}
        <div className="mb-5 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400
                       hover:text-indigo-600 transition-colors group"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
              className="group-hover:-translate-x-0.5 transition-transform duration-150"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            חזרה להתחברות
          </Link>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
              ✓
            </div>
            <span className="text-xl font-bold text-gray-900">SignDeal</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">הגדרת סיסמה חדשה</h1>
          <p className="text-sm text-gray-500 mt-2">
            הקלד/י סיסמה חדשה לחשבון שלך
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
                {error.includes("פג תוקפו") && (
                  <span>
                    {" "}
                    <Link href="/forgot-password" className="font-semibold underline">
                      בקש קישור חדש
                    </Link>
                  </span>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                סיסמה חדשה
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={INPUT}
                placeholder="לפחות 8 תווים"
                required
                autoFocus
                autoComplete="new-password"
                minLength={8}
              />
              {password.length > 0 && !passwordLong && (
                <p className="mt-1 text-xs text-red-500">הסיסמה חייבת להכיל לפחות 8 תווים</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                אימות סיסמה
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className={INPUT}
                placeholder="הכנס/י את הסיסמה שוב"
                required
                autoComplete="new-password"
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">הסיסמאות אינן תואמות</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
            >
              {loading ? "שומר..." : "שמור סיסמה חדשה"}
            </button>

          </form>
        </div>

        {/* Legal links */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/legal/terms"   className="text-xs text-gray-400 hover:text-gray-600 transition-colors">תנאי שימוש</Link>
          <Link href="/legal/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">מדיניות פרטיות</Link>
          <a href="mailto:support@signdeal.co.il" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">support@signdeal.co.il</a>
        </div>

      </div>
    </main>
  );
}
