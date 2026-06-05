"use client";

/**
 * GrowLaunchForm — collects ONLY the two GetLink launch fields (businessNumber +
 * phone) and calls the REAL POST /api/grow/onboarding/start. The server fills the
 * rest (marketer, price_quote, is_direct_debit=1, is_send_sms=0, website="").
 *
 * On 201 it stores { sessionId, formUrl } in sessionStorage (NOT the URL, NOT the
 * DB) and navigates to the dedicated full-page screen at
 * /settings/payments/grow/onboarding. This is NOT the Grow registration form —
 * that is Grow's hosted page, shown in the iframe on the next screen.
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { writeGrowLaunch } from "./onboardingLaunch";

export function GrowLaunchForm() {
  const router = useRouter();
  const [businessNumber, setBusinessNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = businessNumber.trim() !== "" && phone.trim() !== "" && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/grow/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ businessNumber: businessNumber.trim(), phone: phone.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        formUrl?: string;
        error?: string;
      };
      if (res.status === 201 && json.sessionId && json.formUrl) {
        // Hand off via sessionStorage (formUrl stays out of the URL), then navigate
        // in-app to the dedicated full-page onboarding screen.
        writeGrowLaunch({ sessionId: json.sessionId, formUrl: json.formUrl });
        router.push("/settings/payments/grow/onboarding");
        return;
      }
      if (res.status === 503) setError("חיבור Grow אינו פעיל כעת. נסה שוב מאוחר יותר.");
      else if (res.status === 409)
        setError(typeof json.error === "string" ? json.error : "העסק כבר קיים במערכת Grow.");
      else if (res.status === 422)
        setError(typeof json.error === "string" ? json.error : "לא ניתן להתחיל את ההרשמה — בדוק את הפרטים.");
      else if (res.status === 429) setError("יותר מדי ניסיונות. המתן מעט ונסה שוב.");
      else if (res.status === 502) setError("שירות Grow אינו זמין כעת. נסה שוב.");
      else if (res.status === 400) setError("יש למלא מספר עוסק וטלפון.");
      else setError("אירעה שגיאה בהתחלת ההרשמה. נסה שוב.");
    } catch {
      setError("אירעה שגיאה בהתחלת ההרשמה. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="grow-business-number" className="block text-xs font-medium text-gray-600 mb-1">
          מספר עוסק / ח.פ / ת.ז
        </label>
        <input
          id="grow-business-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={businessNumber}
          onChange={(e) => setBusinessNumber(e.target.value)}
          disabled={submitting}
          placeholder="לדוגמה: 512345678"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
        />
      </div>

      <div>
        <label htmlFor="grow-phone" className="block text-xs font-medium text-gray-600 mb-1">
          טלפון נייד
        </label>
        <input
          id="grow-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
          placeholder="לדוגמה: 0501234567"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
        />
      </div>

      {error && <p className="text-sm text-red-600 leading-relaxed">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {submitting ? "מתחבר…" : "התחבר ל-Grow ←"}
      </button>

      <p className="text-xs text-gray-400 leading-relaxed">
        לאחר הלחיצה ייפתח טופס ההרשמה המאובטח של Grow בתוך SignDeal. את מילוי הפרטים מבצעים בתוך Grow.
      </p>
    </form>
  );
}
