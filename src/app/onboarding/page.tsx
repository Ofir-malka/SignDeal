"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-900 placeholder-gray-400 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";
const INPUT_OK  = "border-gray-200";
const INPUT_ERR = "border-red-400 bg-red-50 focus:ring-red-400";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, update } = useSession();

  const [fullName,      setFullName]      = useState(session?.user?.name ?? "");
  const [phone,         setPhone]         = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [idNumber,      setIdNumber]      = useState("");

  const [loading,      setLoading]      = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors,  setFieldErrors]  = useState<Set<string>>(new Set());

  function err(field: string) {
    return fieldErrors.has(field) ? INPUT_ERR : INPUT_OK;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError("");
    setFieldErrors(new Set());
    setLoading(true);

    try {
      const res = await fetch("/api/users/complete-profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, licenseNumber, idNumber }),
      });

      const data = await res.json();

      if (res.status === 400 && data.fields) {
        setFieldErrors(new Set<string>(data.fields));
        return;
      }
      if (res.status === 409) {
        setGeneralError(data.error ?? "שגיאת ייחודיות");
        return;
      }
      if (!res.ok) {
        setGeneralError(data.error ?? "אירעה שגיאה, אנא נסה שנית");
        return;
      }

      // Re-issue JWT with profileComplete = true so middleware allows / immediately.
      // update() PATCHes /api/auth/session → jwt callback trigger:"update" → new cookie.
      await update({ profileComplete: true, name: fullName.trim() });
      router.push("/");
      router.refresh();
    } catch {
      setGeneralError("שגיאת רשת — בדוק חיבור לאינטרנט ונסה שנית");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
              ✓
            </div>
            <span className="text-xl font-bold text-gray-900">SignDeal</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">השלמת פרופיל מתווך</h1>
          <p className="text-sm text-gray-500 mt-2">
            נדרש מידע נוסף כדי להפעיל את החשבון שלך
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
            >
              {loading ? "שומר..." : "השלם פרופיל"}
            </button>

          </form>
        </div>
      </div>
    </main>
  );
}
