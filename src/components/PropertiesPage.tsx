"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type ApiPropertyResponse,
  type Property,
  apiToProperty,
  PROPERTY_TYPE_LABELS,
  PROPERTY_LISTING_TYPE_LABELS,
} from "@/lib/api-properties";
import { parsePropertyAddress } from "@/lib/format-address";

// ─── Type badge palette ───────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  APARTMENT: { bg: "bg-blue-50",    text: "text-blue-700"    },
  HOUSE:     { bg: "bg-emerald-50", text: "text-emerald-700" },
  OFFICE:    { bg: "bg-purple-50",  text: "text-purple-700"  },
  LAND:      { bg: "bg-amber-50",   text: "text-amber-700"   },
  PARKING:   { bg: "bg-gray-100",   text: "text-gray-600"    },
  OTHER:     { bg: "bg-gray-100",   text: "text-gray-600"    },
};

const LISTING_BADGE: Record<string, string> = {
  RENTAL: "bg-teal-50 text-teal-700",
  SALE:   "bg-violet-50 text-violet-700",
  BOTH:   "bg-indigo-50 text-indigo-700",
};

// ─── PropertyCard ─────────────────────────────────────────────────────────────

type DeleteState =
  | { phase: "idle" }
  | { phase: "confirming" }
  | { phase: "deleting" }
  | { phase: "error"; message: string };

function PropertyCard({
  p,
  onDeleted,
}: {
  p: Property;
  onDeleted: (id: string) => void;
}) {
  const badge = TYPE_BADGE[p.typeKey] ?? TYPE_BADGE.OTHER;
  const hasAnyMeta = p.rooms != null || p.floor != null || p.sizeSqm != null;
  const [del, setDel] = useState<DeleteState>({ phase: "idle" });

  // Decode encoded address — never expose raw "street||floor||apt" to the UI
  const { address: displayAddress, floor: addrFloor, apartment: addrApt } =
    parsePropertyAddress(p.address);

  async function handleDelete() {
    setDel({ phase: "deleting" });
    try {
      const res = await fetch(`/api/properties/${p.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(p.id);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setDel({ phase: "error", message: body.error ?? "שגיאה במחיקת הנכס" });
    } catch {
      setDel({ phase: "error", message: "שגיאה בחיבור לשרת. נסה שוב." });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">

      {/* Header: address + type badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug">{displayAddress}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {p.city}
            {addrFloor     ? ` · קומה ${addrFloor}`     : ""}
            {addrApt       ? ` · דירה ${addrApt}`       : ""}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
            {p.typeLabel}
          </span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${LISTING_BADGE[p.listingTypeKey] ?? LISTING_BADGE.RENTAL}`}>
            {p.listingTypeLabel}
          </span>
        </div>
      </div>

      {/* Meta chips */}
      {hasAnyMeta && (
        <div className="flex flex-wrap gap-2">
          {p.rooms != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-600">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              {p.rooms} חד׳
            </span>
          )}
          {p.floor != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-600">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
              קומה {p.floor}
            </span>
          )}
          {p.sizeSqm != null && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs text-gray-600">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              {p.sizeSqm} מ״ר
            </span>
          )}
        </div>
      )}

      {/* Asking price */}
      {p.askingPrice && (
        <div className="bg-gray-50 rounded-lg px-3.5 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">מחיר מבוקש</p>
          <p className="text-sm font-bold text-gray-900">{p.askingPrice}</p>
        </div>
      )}

      {/* Delete error */}
      {del.phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-700" dir="rtl">
          {del.message}
          <button
            type="button"
            onClick={() => setDel({ phase: "idle" })}
            className="block mt-1.5 text-red-500 underline hover:text-red-700"
          >
            סגור
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-gray-100 mt-auto" dir="rtl">
        {del.phase === "confirming" ? (
          /* Confirmation row */
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600 font-medium">האם למחוק את הנכס?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDel({ phase: "idle" })}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all"
              >
                מחק
              </button>
            </div>
          </div>
        ) : del.phase === "deleting" ? (
          /* Deleting spinner */
          <div className="flex items-center justify-center gap-2 py-0.5">
            <svg className="animate-spin text-red-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-xs text-gray-500">מוחק...</span>
          </div>
        ) : (
          /* Normal footer */
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              p.contractCount > 0 ? "text-indigo-600" : "text-gray-400"
            }`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {p.contractCount === 0 ? "אין חוזים" : `${p.contractCount} חוזים`}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{p.createdDate}</span>
              {/* Delete trigger — only shown in idle/error phase */}
              {del.phase !== "error" && (
                <button
                  type="button"
                  onClick={() => setDel({ phase: "confirming" })}
                  title="מחק נכס"
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  aria-label="מחק נכס"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
        <div className="h-6 bg-gray-100 rounded-full w-14" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 bg-gray-100 rounded-md w-16" />
        <div className="h-6 bg-gray-100 rounded-md w-16" />
        <div className="h-6 bg-gray-100 rounded-md w-16" />
      </div>
      <div className="h-14 bg-gray-50 rounded-lg" />
      <div className="pt-3 border-t border-gray-100 flex justify-between">
        <div className="h-3 bg-gray-100 rounded w-20" />
        <div className="h-3 bg-gray-100 rounded w-16" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">אין נכסים עדיין</h2>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        הוסף את הנכסים שאתה משווק כדי לקשר אותם לחוזים ולעקוב אחריהם בקלות.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        הוסף נכס ראשון
      </button>
    </div>
  );
}

// ─── New property modal ───────────────────────────────────────────────────────
//
// Structured address fields — same format as NewContractForm.
// Built address: "<street> <houseNumber>||<floor>||<apartment>"
// If floor+apartment are empty: "<street> <houseNumber>" (legacy-compatible).

const MODAL_INITIAL = {
  street:      "",
  houseNumber: "",
  floor:       "",
  apartment:   "",
  city:        "",
  type:        "APARTMENT",
  listingType: "RENTAL",
  rooms:       "",
  sizeSqm:     "",
  askingPrice: "",
};

/** Mirrors buildPropertyAddress in NewContractForm. */
function buildAddress(f: typeof MODAL_INITIAL): string {
  const street = f.street.trim();
  if (!street) return "";
  const num   = f.houseNumber.trim();
  const floor = f.floor.trim();
  const apt   = f.apartment.trim();
  const base  = num ? `${street} ${num}` : street;
  if (!floor && !apt) return base;
  return `${base}||${floor}||${apt}`;
}

// Shared input className to avoid repetition
const INPUT_CLS =
  "w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 " +
  "placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
  "focus:border-transparent transition-all";

function NewPropertyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Property) => void;
}) {
  const [form, setForm]         = useState(MODAL_INITIAL);
  const [fieldErrors, setFE]    = useState<Record<string, string>>({});
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const set = (patch: Partial<typeof MODAL_INITIAL>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    // Clear field-level errors on change
    const keys = Object.keys(patch) as (keyof typeof MODAL_INITIAL)[];
    if (keys.some((k) => fieldErrors[k])) {
      setFE((prev) => {
        const next = { ...prev };
        keys.forEach((k) => delete next[k]);
        return next;
      });
    }
  };

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.street.trim()) e.street = "שם רחוב הוא שדה חובה";
    if (!form.city.trim())   e.city   = "עיר היא שדה חובה";
    return e;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFE(errs); return; }

    setSubmit(true);
    setError(null);
    try {
      const address  = buildAddress(form);
      const floorNum = form.floor.trim() ? parseInt(form.floor.trim(), 10) : null;

      const res = await fetch("/api/properties", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          city:        form.city.trim(),
          type:        form.type,
          listingType: form.listingType,
          rooms:       form.rooms      ? Number(form.rooms)      : null,
          floor:       Number.isInteger(floorNum) ? floorNum     : null,
          sizeSqm:     form.sizeSqm    ? Number(form.sizeSqm)    : null,
          askingPrice: form.askingPrice
            ? Math.round(Number(form.askingPrice.replace(/,/g, "")) * 100)
            : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת נכס");
      }
      const raw: ApiPropertyResponse = await res.json();
      onCreated(apiToProperty(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת נכס. נסה שוב.");
    } finally {
      setSubmit(false);
    }
  }

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">נכס חדש</h2>
            <p className="text-sm text-gray-500 mt-0.5">הוסף נכס לרשימת הנכסים שלך</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="סגור"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">

          {/* ── Address section (structured) ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">כתובת הנכס</p>
            <div className="space-y-3">

              {/* Street — full width, required */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  שם רחוב <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="רוטשילד"
                  value={form.street}
                  onChange={(e) => set({ street: e.target.value })}
                  className={[INPUT_CLS, fieldErrors.street ? "border-red-300 ring-1 ring-red-300" : ""].join(" ")}
                />
                {fieldErrors.street && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.street}</p>
                )}
              </div>

              {/* House number · Floor · Apartment — 3 columns */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">מספר בית</label>
                  <input
                    type="text"
                    placeholder="42"
                    value={form.houseNumber}
                    onChange={(e) => set({ houseNumber: e.target.value })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">קומה</label>
                  <input
                    type="text"
                    placeholder="4"
                    value={form.floor}
                    onChange={(e) => set({ floor: e.target.value })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">דירה</label>
                  <input
                    type="text"
                    placeholder="8"
                    value={form.apartment}
                    onChange={(e) => set({ apartment: e.target.value })}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* City — required */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  עיר <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="תל אביב"
                  value={form.city}
                  onChange={(e) => set({ city: e.target.value })}
                  className={[INPUT_CLS, fieldErrors.city ? "border-red-300 ring-1 ring-red-300" : ""].join(" ")}
                />
                {fieldErrors.city && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.city}</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Property classification ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">סיווג נכס</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">סוג נכס</label>
                <select
                  value={form.type}
                  onChange={(e) => set({ type: e.target.value })}
                  className={INPUT_CLS}
                >
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ייעוד</label>
                <select
                  value={form.listingType}
                  onChange={(e) => set({ listingType: e.target.value })}
                  className={INPUT_CLS}
                >
                  {Object.entries(PROPERTY_LISTING_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Optional details ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">פרטים נוספים (אופציונלי)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">חדרים</label>
                <input
                  type="number"
                  placeholder="3.5"
                  step="0.5"
                  min="0"
                  value={form.rooms}
                  onChange={(e) => set({ rooms: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">גודל (מ״ר)</label>
                <input
                  type="number"
                  placeholder="85"
                  min="0"
                  value={form.sizeSqm}
                  onChange={(e) => set({ sizeSqm: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">מחיר מבוקש (₪)</label>
                <input
                  type="text"
                  placeholder="3,500,000"
                  value={form.askingPrice}
                  onChange={(e) => set({ askingPrice: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                שומר...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                צור נכס
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);

  useEffect(() => {
    async function fetchProperties() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/properties");
        if (!res.ok) throw new Error("שגיאה בטעינת נכסים");
        const data: ApiPropertyResponse[] = await res.json();
        setProperties(data.map(apiToProperty));
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
      } finally {
        setLoading(false);
      }
    }
    fetchProperties();
  }, []);

  function handleCreated(p: Property) {
    setProperties((prev) => [p, ...prev]);
    setShowModal(false);
  }

  const handleDeleted = useCallback((id: string) => {
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">הנכסים שלי</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול הנכסים המשווקים שלך</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          נכס חדש
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-8 py-8">

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : properties.length === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-5">{properties.length} נכסים</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {properties.map((p) => (
                <PropertyCard key={p.id} p={p} onDeleted={handleDeleted} />
              ))}
            </div>
          </>
        )}

      </main>

      {/* Modal */}
      {showModal && (
        <NewPropertyModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
