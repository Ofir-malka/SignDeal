"use client";

/**
 * QuickInterestedForm
 *
 * Single-page fast flow for "החתמת מתעניין" contracts.
 * Replaces the 5-step wizard for the most common contract type.
 *
 * API mapping:
 *   contractType    → "החתמת מתעניין"  (hardcoded)
 *   language        → form.language     (default "HE")
 *   clientName      → form.clientName
 *   clientPhone     → form.clientPhone
 *   clientEmail     → form.clientEmail  (optional)
 *   propertyAddress → form.address
 *   propertyCity    → form.city
 *   dealType        → form.dealType     ("SALE" | "RENTAL")
 *   propertyPrice   → form.priceNis × 100  (NIS → agorot)
 *   commission      → form.commNis  × 100  (NIS → agorot, allows 0)
 */

import { useState, useRef } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type Lang     = "HE" | "EN" | "FR" | "RU";
type DealType = "SALE" | "RENTAL";

interface FormState {
  language:  Lang;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address:     string;
  city:        string;
  dealType:    DealType;
  priceNis:    string;   // typed as NIS; ×100 before API call
  commNis:     string;   // typed as NIS; ×100 before API call (0 allowed)
}

const INITIAL: FormState = {
  language:   "HE",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  address:     "",
  city:        "",
  dealType:    "SALE",
  priceNis:    "",
  commNis:     "",
};

type Stage =
  | { name: "idle" }
  | { name: "submitting" }
  | { name: "success"; contractId: string; signatureToken: string }
  | { name: "error"; message: string };

// ── Language options (same set as NewContractWizard) ───────────────────────────

const LANGS: { id: Lang; flag: string; label: string }[] = [
  { id: "HE", flag: "🇮🇱", label: "עברית"   },
  { id: "EN", flag: "🇺🇸", label: "English"  },
  { id: "FR", flag: "🇫🇷", label: "Français" },
  { id: "RU", flag: "🇷🇺", label: "Русский"  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip commas/spaces then parse; returns NaN on invalid input. */
function parseNis(raw: string): number {
  return parseFloat(raw.replace(/[, ]/g, ""));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-800 mb-1.5">
      {children}
      {optional && (
        <span className="mr-1.5 text-xs font-normal text-gray-400">(אופציונלי)</span>
      )}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text", autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
    />
  );
}

function NisInput({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 pointer-events-none select-none">
        ₪
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pr-9 pl-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({
  contractId,
  signatureToken,
}: {
  contractId: string;
  signatureToken: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin      = typeof window !== "undefined" ? window.location.origin : "";
  const signingLink = `${origin}/contracts/sign/${signatureToken}`;

  function copy() {
    navigator.clipboard.writeText(signingLink);
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-10">
      <div className="max-w-md mx-auto">
        {/* Success card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          {/* Check icon */}
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            החוזה נשלח בהצלחה!
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            החוזה נוצר ונשלח ללקוח ב-SMS ובמייל
          </p>

          {/* Signing link */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 mb-5 text-right">
            <p className="text-xs text-gray-500 mb-1">קישור חתימה ללקוח</p>
            <p className="text-xs text-indigo-600 break-all leading-relaxed">{signingLink}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={copy}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all"
            >
              {copied ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  הועתק!
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  העתק קישור
                </>
              )}
            </button>

            <Link
              href={`/contracts/${contractId}`}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              צפייה בחוזה
            </Link>

            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              חזרה לדשבורד
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

export function QuickInterestedForm() {
  const [form, setForm]   = useState<FormState>(INITIAL);
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error when user starts correcting
    if (stage.name === "error") setStage({ name: "idle" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (stage.name === "submitting") return;

    // ── Client-side validation ──────────────────────────────────────────────
    if (!form.clientName.trim())  return setStage({ name: "error", message: "שם הלקוח הוא שדה חובה" });
    if (!form.clientPhone.trim()) return setStage({ name: "error", message: "טלפון הלקוח הוא שדה חובה" });
    if (!form.address.trim())     return setStage({ name: "error", message: "כתובת הנכס היא שדה חובה" });
    if (!form.city.trim())        return setStage({ name: "error", message: "עיר הנכס היא שדה חובה" });

    const priceNis = parseNis(form.priceNis);
    const commNis  = parseNis(form.commNis);

    if (!form.priceNis.trim() || isNaN(priceNis) || priceNis <= 0)
      return setStage({ name: "error", message: "יש להזין מחיר נכס חיובי תקין" });
    if (form.commNis.trim() === "" || isNaN(commNis) || commNis < 0)
      return setStage({ name: "error", message: "יש להזין עמלה תקינה (ניתן גם 0)" });

    setStage({ name: "submitting" });

    try {
      const res = await fetch("/api/contracts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType:    "החתמת מתעניין",
          language:        form.language,
          dealType:        form.dealType,
          propertyAddress: form.address.trim(),
          propertyCity:    form.city.trim(),
          // API stores in agorot — multiply ×100 (same as NewContractWizard)
          propertyPrice:   Math.round(priceNis * 100),
          commission:      Math.round(commNis  * 100),
          clientName:      form.clientName.trim(),
          clientPhone:     form.clientPhone.trim(),
          clientEmail:     form.clientEmail.trim() || undefined,
          hideFullAddressFromClient: false,
        }),
      });

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        const msg = typeof data.error === "string"
          ? data.error
          : "שגיאה ביצירת החוזה — אנא נסה שוב";
        setStage({ name: "error", message: msg });
        return;
      }

      setStage({
        name:           "success",
        contractId:     String(data.id      ?? ""),
        signatureToken: String(data.signatureToken ?? ""),
      });
    } catch {
      setStage({ name: "error", message: "שגיאת רשת — בדוק את החיבור ונסה שוב" });
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (stage.name === "success") {
    return (
      <>
        {/* Minimal header */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">החתמת מתעניין מהירה</h1>
        </header>
        <SuccessScreen contractId={stage.contractId} signatureToken={stage.signatureToken} />
      </>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const isSubmitting = stage.name === "submitting";

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-3 shrink-0">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-gray-900">החתמת מתעניין מהירה</h1>
          <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
            שלח הסכם חתימה ללקוח תוך פחות מדקה
          </p>
        </div>
      </header>

      {/* Scrollable body */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="max-w-lg mx-auto">
          <form onSubmit={handleSubmit} noValidate>

            {/* ── Language ─────────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
              <Label>שפת החוזה</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {LANGS.map((lang) => {
                  const active = form.language === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => set("language", lang.id)}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                      ].join(" ")}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Client ───────────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
                פרטי הלקוח
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>שם מלא</Label>
                  <Input
                    value={form.clientName}
                    onChange={(v) => set("clientName", v)}
                    placeholder="ישראל ישראלי"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <Label>טלפון</Label>
                  <Input
                    value={form.clientPhone}
                    onChange={(v) => set("clientPhone", v)}
                    placeholder="05X-XXXXXXX"
                    type="tel"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <Label optional>אימייל</Label>
                  <Input
                    value={form.clientEmail}
                    onChange={(v) => set("clientEmail", v)}
                    placeholder="israel@example.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
              </div>
            </section>

            {/* ── Property ─────────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
                פרטי הנכס
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>כתובת הנכס</Label>
                  <Input
                    value={form.address}
                    onChange={(v) => set("address", v)}
                    placeholder="רוטשילד 1"
                    autoComplete="street-address"
                  />
                </div>
                <div>
                  <Label>עיר</Label>
                  <Input
                    value={form.city}
                    onChange={(v) => set("city", v)}
                    placeholder="תל אביב"
                    autoComplete="address-level2"
                  />
                </div>

                {/* Deal type toggle */}
                <div>
                  <Label>סוג עסקה</Label>
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden mt-1">
                    {([ ["SALE", "מכירה"], ["RENTAL", "שכירות"] ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => set("dealType", val)}
                        className={[
                          "flex-1 py-2.5 text-sm font-semibold transition-all",
                          form.dealType === val
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Financial ────────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
                פרטים פיננסיים
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>מחיר הנכס</Label>
                  <NisInput
                    value={form.priceNis}
                    onChange={(v) => set("priceNis", v)}
                    placeholder="1,500,000"
                  />
                </div>
                <div>
                  <Label>עמלת תיווך</Label>
                  <NisInput
                    value={form.commNis}
                    onChange={(v) => set("commNis", v)}
                    placeholder="15,000"
                  />
                  <p className="text-xs text-gray-400 mt-1">ניתן להזין 0 אם העמלה תוגדר מאוחר יותר</p>
                </div>
              </div>
            </section>

            {/* ── Error banner ─────────────────────────────────────────────── */}
            {stage.name === "error" && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-red-700">{stage.message}</p>
              </div>
            )}

            {/* ── Submit ───────────────────────────────────────────────────── */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-base font-bold px-6 py-4 rounded-xl shadow-md shadow-indigo-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  שולח חוזה...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  שלח חוזה לחתימה
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3">
              החוזה יישלח ללקוח ב-SMS ובמייל אוטומטית
            </p>

          </form>
        </div>
      </main>
    </>
  );
}
