"use client";

import Link  from "next/link";
import { useState } from "react";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 " +
  "placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function ForgotPasswordForm() {
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Fire-and-forget from the UI perspective — the server always returns 200.
      // We never tell the user whether the email exists.
      await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always show the generic success state, regardless of status code.
      setSubmitted(true);
    } catch {
      // Network error — inform the user without leaking email existence
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
          <h1 className="text-2xl font-bold text-gray-900">שכחת את הסיסמה?</h1>
          {!submitted && (
            <p className="text-sm text-gray-500 mt-2">
              הכנס/י את כתובת האימייל שלך ונשלח קישור לאיפוס הסיסמה
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

          {submitted ? (
            /* ── Success state ──────────────────────────────────────────── */
            <div className="text-center space-y-4">
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
              <p className="text-base font-semibold text-gray-900">
                הבקשה התקבלה
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                אם כתובת האימייל רשומה במערכת, שלחנו לך הוראות לאיפוס הסיסמה.
                <br />
                בדוק/י את תיבת הדואר — כולל תיקיית הספאם.
              </p>
              <p className="text-xs text-gray-400">
                הקישור תקף לשעה אחת בלבד.
              </p>
              <Link
                href="/login"
                className="inline-block mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                חזרה להתחברות
              </Link>
            </div>
          ) : (
            /* ── Request form ───────────────────────────────────────────── */
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  אימייל
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={INPUT}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
              >
                {loading ? "שולח..." : "שלח קישור לאיפוס"}
              </button>
            </form>
          )}

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
