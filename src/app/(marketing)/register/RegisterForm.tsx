"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

interface Props {
  googleEnabled: boolean;
  appleEnabled:  boolean;
}

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-900 placeholder-gray-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";
const INPUT_OK  = "border-gray-200";
const INPUT_ERR = "border-red-400 bg-red-50 focus:ring-red-400";

export function RegisterForm({ googleEnabled, appleEnabled }: Props) {
  const router = useRouter();

  const [fullName,      setFullName]      = useState("");
  const [email,         setEmail]         = useState("");
  const [phone,         setPhone]         = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [idNumber,      setIdNumber]      = useState("");
  const [logoUrl,       setLogoUrl]       = useState("");
  const [password,      setPassword]      = useState("");
  const [confirmPwd,    setConfirmPwd]    = useState("");

  const [loading,      setLoading]      = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors,  setFieldErrors]  = useState<Set<string>>(new Set());

  const busy      = loading || oauthLoading !== null;
  const showOAuth = googleEnabled || appleEnabled;

  function err(field: string) {
    return fieldErrors.has(field) ? INPUT_ERR : INPUT_OK;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError("");
    setFieldErrors(new Set());

    if (password !== confirmPwd) {
      setGeneralError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, licenseNumber, idNumber, logoUrl, password }),
      });

      const data = await res.json();

      if (res.status === 400 && data.fields) {
        setFieldErrors(new Set<string>(data.fields));
        return;
      }
      if (!res.ok) {
        setGeneralError(data.error ?? "אירעה שגיאה, אנא נסה שנית");
        return;
      }

      // 201 — auto-login with the credentials just registered
      const loginResult = await signIn("credentials", { email, password, redirect: false });
      if (loginResult?.ok) {
        router.push("/");
        router.refresh();
      } else {
        // Account created but auto-login failed — fall back to login page
        setSuccess(true);
        setTimeout(() => router.push("/login"), 1500);
      }

    } catch {
      setGeneralError("שגיאת רשת — בדוק חיבור לאינטרנט ונסה שנית");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    // signIn for OAuth redirects the browser; setOauthLoading(null) is only
    // reached on an unexpected error (no redirect occurred).
    try {
      await signIn(provider, { redirectTo: "/" });
    } catch {
      setOauthLoading(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* Back to home */}
        <div className="mb-5 text-center">
          <Link
            href="/"
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
            חזרה לדף הבית
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
          <h1 className="text-2xl font-bold text-gray-900">יצירת חשבון מתווך</h1>
          <p className="text-sm text-gray-500 mt-2">
            הזן את פרטיך כדי להתחיל לנהל חוזים ותשלומים
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

          {success ? (
            /* ── Success state ── */
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600 text-2xl">
                ✓
              </div>
              <p className="text-base font-semibold text-gray-900">החשבון נוצר בהצלחה!</p>
              <p className="text-sm text-gray-500">מועבר לדף ההתחברות...</p>
            </div>
          ) : (
            /* ── Form ── */
            <div className="space-y-4">

              {/* OAuth buttons — shown only when both provider env vars are set */}
              {showOAuth && (
                <div className="space-y-2.5">
                  {googleEnabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuth("google")}
                      disabled={busy}
                      className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      {/* Google G logo */}
                      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      {oauthLoading === "google" ? "מתחבר..." : "המשך עם Google"}
                    </button>
                  )}

                  {appleEnabled && (
                    <button
                      type="button"
                      onClick={() => handleOAuth("apple")}
                      disabled={busy}
                      className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-black text-sm font-medium text-white hover:bg-gray-900 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      {/* Apple logo */}
                      <svg width="15" height="18" viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-167.3-108.2C67.3 781 12 683.8 12 588.4c0-249.4 171.4-381.8 339.8-381.8 89.2 0 163.4 58.8 220.1 58.8 53.7 0 137.6-62.8 242.9-62.8zM544.9 54.3c28.3-34.1 48.9-81.7 48.9-129.3 0-6.3-.6-12.6-1.9-18.3-45.6 1.7-99.8 30.6-132 69.4-25.7 29-50.9 76.1-50.9 124.4 0 7.6 1.3 15.1 1.9 17.4 3.2.6 8.4 1.3 13.6 1.3 40.9 0 89.2-26.3 120.4-64.9z"/>
                      </svg>
                      {oauthLoading === "apple" ? "מתחבר..." : "המשך עם Apple"}
                    </button>
                  )}

                  {/* Divider */}
                  <div className="relative pt-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-3 text-xs text-gray-400">
                        או הירשם עם אימייל
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Credentials form */}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                {/* General error banner */}
                {generalError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {generalError}
                  </div>
                )}

                {/* Full name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    שם מלא <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="שם מלא"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className={`${INPUT} ${err("fullName")}`}
                  />
                  {fieldErrors.has("fullName") && (
                    <p className="mt-1 text-xs text-red-600">שם מלא הוא שדה חובה</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    אימייל <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={`${INPUT} ${err("email")}`}
                  />
                  {fieldErrors.has("email") && (
                    <p className="mt-1 text-xs text-red-600">אימייל הוא שדה חובה</p>
                  )}
                </div>

                {/* Phone + License — 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      טלפון <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="05X-XXXXXXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className={`${INPUT} ${err("phone")}`}
                    />
                    {fieldErrors.has("phone") && (
                      <p className="mt-1 text-xs text-red-600">שדה חובה</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      מספר רישיון מתווך <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="IL-XXXXX"
                      value={licenseNumber}
                      onChange={e => setLicenseNumber(e.target.value)}
                      className={`${INPUT} ${err("licenseNumber")}`}
                    />
                    {fieldErrors.has("licenseNumber") && (
                      <p className="mt-1 text-xs text-red-600">שדה חובה</p>
                    )}
                  </div>
                </div>

                {/* ID number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    תעודת זהות <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="XXXXXXXXX"
                    maxLength={9}
                    value={idNumber}
                    onChange={e => setIdNumber(e.target.value)}
                    className={`${INPUT} ${err("idNumber")}`}
                  />
                  {fieldErrors.has("idNumber") && (
                    <p className="mt-1 text-xs text-red-600">תעודת זהות היא שדה חובה</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    סיסמה <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="לפחות 8 תווים"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`${INPUT} ${err("password")}`}
                  />
                  {fieldErrors.has("password") && (
                    <p className="mt-1 text-xs text-red-600">סיסמה חייבת להכיל לפחות 8 תווים</p>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    אימות סיסמה <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="חזור על הסיסמה"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    className={`${INPUT} ${INPUT_OK}`}
                  />
                </div>

                {/* Logo URL — optional */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    לוגו לחוזים / PDF בלבד{" "}
                    <span className="text-gray-400 text-xs font-normal">(לא חובה)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={logoUrl}
                    onChange={e => setLogoUrl(e.target.value)}
                    className={`${INPUT} ${INPUT_OK}`}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    הלוגו יוצג במסמכי החוזה בלבד, לא באתר
                  </p>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
                >
                  {loading ? "יוצר חשבון..." : "צור חשבון"}
                </button>

              </form>
            </div>
          )}

          {!success && (
            <div className="mt-6 text-center text-sm text-gray-500">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
                התחבר
              </Link>
            </div>
          )}

        </div>

        {/* Legal links */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/legal/terms"   className="text-xs text-gray-400 hover:text-gray-600 transition-colors">תנאי שימוש</Link>
          <Link href="/legal/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">מדיניות פרטיות</Link>
          <Link href="/legal/cookies" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">עוגיות</Link>
          <a href="mailto:support@signdeal.co.il" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">support@signdeal.co.il</a>
        </div>
      </div>
    </main>
  );
}
