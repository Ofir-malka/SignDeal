"use client";

/**
 * NewContractForm
 *
 * Unified one-page contract creation form. Replaces the 5-step NewContractWizard
 * as the default UI at /contracts/new.
 *
 * ─── APIs used for existing-record pickers ───────────────────────────────────
 * GET /api/clients    → { id, name, phone, email, idNumber }[]  (broker-scoped)
 * GET /api/properties → { id, address, city, askingPrice?, listingType }[]
 * Both are read-only here; selection only prefills local form state.
 *
 * ─── Backend limitations (documented) ────────────────────────────────────────
 * • DealType: single SALE | RENTAL per contract. Multi-deal requires schema
 *   migration. UI is single-select.
 * • propertyNotes: no schema field — omitted.
 *
 * ─── Payload to POST /api/contracts ──────────────────────────────────────────
 * { contractType, language, dealType, clientName, clientPhone,
 *   clientEmail, clientIdNumber, propertyAddress, propertyCity,
 *   propertyPrice (agorot), commission (agorot) }
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

// ── API response shapes ────────────────────────────────────────────────────────

interface ApiClient {
  id:       string;
  name:     string;
  phone:    string;
  email:    string;
  idNumber: string;
}

interface ApiProperty {
  id:          string;
  address:     string;
  city:        string;
  askingPrice: number | null;  // agorot; null when not set
  listingType: string;
}

// ── Form types ─────────────────────────────────────────────────────────────────

type Lang           = "HE" | "EN" | "FR" | "RU";
type DealType       = "SALE" | "RENTAL";
type CommissionMode = "fixed" | "percent";

interface FormState {
  language:        Lang;
  clientName:      string;
  clientPhone:     string;
  clientEmail:     string;
  clientIdNumber:  string;
  skipEmailId:     boolean;
  propertyAddress: string;
  propertyCity:    string;
  dealType:        DealType;
  priceNis:        string;
  commissionMode:  CommissionMode;
  commissionNis:   string;
  commissionPct:   string;
}

type Stage =
  | { name: "idle" }
  | { name: "submitting" }
  | { name: "success"; contractId: string; signatureToken: string; clientName: string }
  | { name: "error"; message: string };

interface FieldError { [key: string]: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL: FormState = {
  language:        "HE",
  clientName:      "",
  clientPhone:     "",
  clientEmail:     "",
  clientIdNumber:  "",
  skipEmailId:     false,
  propertyAddress: "",
  propertyCity:    "",
  dealType:        "SALE",
  priceNis:        "",
  commissionMode:  "percent",
  commissionNis:   "",
  commissionPct:   "",
};

const LANGS: { id: Lang; flag: string; label: string }[] = [
  { id: "HE", flag: "🇮🇱", label: "עברית"   },
  { id: "EN", flag: "🇺🇸", label: "English"  },
  { id: "FR", flag: "🇫🇷", label: "Français" },
  { id: "RU", flag: "🇷🇺", label: "Русский"  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseNis(raw: string): number {
  return parseFloat(raw.replace(/[, ]/g, ""));
}

function fmtNis(agorot: number): string {
  return Math.round(agorot / 100).toLocaleString("he-IL");
}

function calcCommissionAgorot(f: FormState): number {
  const priceNis = parseNis(f.priceNis);
  if (f.dealType === "SALE" && f.commissionMode === "percent") {
    const pct = parseFloat(f.commissionPct);
    if (isNaN(priceNis) || isNaN(pct)) return NaN;
    return Math.round(priceNis * pct);
  }
  const commNis = parseNis(f.commissionNis);
  return isNaN(commNis) ? NaN : Math.round(commNis * 100);
}

// ── Generic picker hook ────────────────────────────────────────────────────────
// Uses position:fixed + getBoundingClientRect() so the dropdown escapes every
// overflow-hidden / overflow-y-auto ancestor in the dashboard layout stack.

type PickerFetchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "error"; message: string };

interface DropPos { top: number; right: number; minWidth: number }

function usePicker<T>(fetchUrl: string) {
  const [open,    setOpen]   = useState(false);
  const [query,   setQuery]  = useState("");
  const [fetched, setFetched] = useState<PickerFetchState<T>>({ status: "idle" });
  const [dropPos, setDropPos] = useState<DropPos | null>(null);

  // Refs: triggerRef on the trigger button, dropdownRef on the panel
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch once on first open
  useEffect(() => {
    if (!open) return;
    if (fetched.status !== "idle") return;
    setFetched({ status: "loading" });
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data: T[]) => setFetched({ status: "ready", items: data }))
      .catch((err)       => setFetched({ status: "error", message: String(err) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click: close when clicking outside both trigger and panel
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !dropdownRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Scroll: close picker when the user scrolls after it opens.
  // Mobile exception: when the virtual keyboard appears (triggered by autofocus
  // on the search input), iOS/Android scroll the viewport to keep the focused
  // element visible. This fires a scroll event within ~50–150ms of opening and
  // would immediately close the picker. We ignore all scroll events for the
  // first 300ms after opening so the keyboard animation can complete.
  useEffect(() => {
    if (!open) return;
    const openedAt = Date.now();
    function onScroll() {
      if (Date.now() - openedAt < 300) return;
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  function openPicker() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top:      rect.bottom + 4,
        // align right edge of dropdown to right edge of trigger (RTL-friendly)
        right:    window.innerWidth - rect.right,
        minWidth: Math.max(rect.width, 280),
      });
    }
    setOpen(true);
    setQuery("");
  }

  function close() { setOpen(false); setQuery(""); }

  const items = fetched.status === "ready" ? fetched.items : [];

  return { open, openPicker, close, query, setQuery, fetched, items, triggerRef, dropdownRef, dropPos };
}

// ── ClientPicker ───────────────────────────────────────────────────────────────

function ClientPicker({
  selectedName,
  onSelect,
  onClear,
}: {
  selectedName: string | null;
  onSelect:     (c: ApiClient) => void;
  onClear:      () => void;
}) {
  const picker = usePicker<ApiClient>("/api/clients");

  const filtered = picker.items.filter((c) => {
    const q = picker.query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  });

  return (
    <div className="mb-4">
      {/* Trigger / selected chip */}
      {selectedName ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm w-fit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-semibold text-indigo-700">{selectedName}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-indigo-400 hover:text-indigo-600 transition-colors text-xs font-medium underline underline-offset-2 mr-1"
          >
            נקה בחירה
          </button>
        </div>
      ) : (
        <button
          ref={picker.triggerRef}
          type="button"
          onClick={picker.openPicker}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          בחירת לקוח קיים
        </button>
      )}

      {/* Dropdown — fixed to viewport; escapes all overflow ancestors */}
      {picker.open && picker.dropPos && (
        <div
          ref={picker.dropdownRef}
          style={{
            position:  "fixed",
            top:       picker.dropPos.top,
            right:     picker.dropPos.right,
            minWidth:  picker.dropPos.minWidth,
            maxWidth:  400,
            zIndex:    9999,
          }}
          className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
          dir="rtl"
        >
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                autoFocus
                type="text"
                value={picker.query}
                onChange={(e) => picker.setQuery(e.target.value)}
                placeholder="חפש לפי שם או טלפון..."
                className="w-full pe-8 ps-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
              />
            </div>
          </div>
          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {picker.fetched.status === "loading" && (
              <p className="text-sm text-gray-400 text-center py-6">טוען לקוחות...</p>
            )}
            {picker.fetched.status === "error" && (
              <p className="text-sm text-red-500 text-center py-6">שגיאה בטעינת לקוחות</p>
            )}
            {picker.fetched.status === "ready" && filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">לא נמצאו לקוחות</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); picker.close(); }}
                className="w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-indigo-50/60 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 mt-0.5">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PropertyPicker ─────────────────────────────────────────────────────────────

function PropertyPicker({
  selectedAddress,
  onSelect,
  onClear,
}: {
  selectedAddress: string | null;
  onSelect:        (p: ApiProperty) => void;
  onClear:         () => void;
}) {
  const picker = usePicker<ApiProperty>("/api/properties");

  const filtered = picker.items.filter((p) => {
    const q = picker.query.toLowerCase();
    return (
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)
    );
  });

  const LISTING_LABEL: Record<string, string> = {
    SALE:   "למכירה",
    RENTAL: "להשכרה",
    BOTH:   "מכירה / השכרה",
  };

  return (
    <div className="mb-4">
      {/* Trigger / selected chip */}
      {selectedAddress ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm w-fit max-w-full">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-semibold text-indigo-700 truncate max-w-[200px]">{selectedAddress}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-indigo-400 hover:text-indigo-600 transition-colors text-xs font-medium underline underline-offset-2 mr-1 flex-shrink-0"
          >
            נקה בחירה
          </button>
        </div>
      ) : (
        <button
          ref={picker.triggerRef}
          type="button"
          onClick={picker.openPicker}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <rect x="9" y="13" width="6" height="8" rx="0.5" />
          </svg>
          בחירת נכס קיים
        </button>
      )}

      {/* Dropdown — fixed to viewport; escapes all overflow ancestors */}
      {picker.open && picker.dropPos && (
        <div
          ref={picker.dropdownRef}
          style={{
            position:  "fixed",
            top:       picker.dropPos.top,
            right:     picker.dropPos.right,
            minWidth:  picker.dropPos.minWidth,
            maxWidth:  440,
            zIndex:    9999,
          }}
          className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
          dir="rtl"
        >
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                autoFocus
                type="text"
                value={picker.query}
                onChange={(e) => picker.setQuery(e.target.value)}
                placeholder="חפש לפי כתובת או עיר..."
                className="w-full pe-8 ps-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
              />
            </div>
          </div>
          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {picker.fetched.status === "loading" && (
              <p className="text-sm text-gray-400 text-center py-6">טוען נכסים...</p>
            )}
            {picker.fetched.status === "error" && (
              <p className="text-sm text-red-500 text-center py-6">שגיאה בטעינת נכסים</p>
            )}
            {picker.fetched.status === "ready" && filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">לא נמצאו נכסים</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p); picker.close(); }}
                className="w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-indigo-50/60 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                    <rect x="9" y="13" width="6" height="8" rx="0.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.city}
                    {p.listingType && ` · ${LISTING_LABEL[p.listingType] ?? p.listingType}`}
                    {p.askingPrice ? ` · ₪${fmtNis(p.askingPrice)}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function FieldLabel({ children, optional, htmlFor }: {
  children: React.ReactNode; optional?: boolean; htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-700 mb-1.5">
      {children}
      {optional && <span className="ms-1.5 text-xs font-normal text-gray-400">(אופציונלי)</span>}
    </label>
  );
}

function TextInput({ id, value, onChange, placeholder, type = "text", error, disabled }: {
  id?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; error?: string; disabled?: boolean;
}) {
  return (
    <div>
      <input
        id={id} type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={[
          "w-full px-3.5 py-2.5 rounded-xl border text-sm text-gray-900",
          "placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all",
          disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "bg-white",
          error ? "border-red-300 focus:ring-red-400" : "border-gray-200 focus:ring-indigo-500",
        ].join(" ")}
      />
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Contract type options ──────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  {
    id: "interested", label: "החתמת מתעניין",
    subtitle: "רישום הסכמת רוכש או שוכר פוטנציאלי",
    iconBg: "bg-indigo-50 text-indigo-600", active: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M16.5 17.5 18 16l2 2-1.5 1.5" /><path d="M18 16l-1.5 4" />
      </svg>
    ),
  },
  {
    id: "exclusivity", label: "החתמת בעל נכס / בלעדיות",
    subtitle: "הסכם בלעדיות עם בעל הנכס",
    iconBg: "bg-emerald-50 text-emerald-600", active: false,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <rect x="9.5" y="13" width="5" height="8" rx="0.5" /><circle cx="12" cy="16" r="1" />
      </svg>
    ),
  },
  {
    id: "cooperation", label: "הסכם שיתוף פעולה",
    subtitle: "שיתוף עסקה עם מתווך שותף",
    iconBg: "bg-violet-50 text-violet-600", active: false,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="7" r="3" /><path d="M4 20v-1.5a4 4 0 0 1 4-4" />
        <circle cx="16" cy="7" r="3" /><path d="M20 20v-1.5a4 4 0 0 0-4-4" />
        <path d="M9 14.5h6" />
      </svg>
    ),
  },
  {
    id: "transfer", label: "העברת לקוח בין מתווכים",
    subtitle: "רישום העברת לקוח ממתווך אחר",
    iconBg: "bg-rose-50 text-rose-500", active: false,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="3.5" />
        <path d="M6 20v-1a6 6 0 0 1 6-6 6 6 0 0 1 6 6v1" />
        <path d="M4 17h3M4 17l1.5-1.5M4 17l1.5 1.5" />
        <path d="M20 17h-3M20 17l-1.5-1.5M20 17l-1.5 1.5" />
      </svg>
    ),
  },
];

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({ contractId, signatureToken, clientName, onCreateAnother }: {
  contractId: string; signatureToken: string; clientName: string; onCreateAnother: () => void;
}) {
  const baseUrl     = typeof window !== "undefined" ? window.location.origin : "";
  const signingLink = `${baseUrl}/contracts/sign/${signatureToken}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16 gap-6">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">החוזה נוצר בהצלחה!</h2>
        <p className="text-gray-500 text-sm">
          החוזה נשלח ל<span className="font-semibold text-gray-700">{clientName}</span> ב-SMS ובמייל
        </p>
      </div>
      <div className="w-full max-w-md bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-right">
        <p className="text-xs text-gray-400 mb-1 font-medium">קישור לחתימה</p>
        <p className="text-sm text-gray-700 font-mono break-all leading-relaxed">{signingLink}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <button
          onClick={() => {
            navigator.clipboard.writeText(signingLink).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
        >
          {copied ? "✓ הועתק!" : "העתק קישור"}
        </button>
        <Link
          href={`/contracts/${contractId}`}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white text-center hover:bg-indigo-700 transition-all"
        >
          צפייה בחוזה
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <button
          onClick={onCreateAnother}
          className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-all"
        >
          + יצירת חוזה נוסף
        </button>
        <Link
          href="/dashboard"
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 text-center hover:bg-gray-50 transition-all"
        >
          חזרה לדשבורד
        </Link>
      </div>
    </div>
  );
}

// ── Main form ──────────────────────────────────────────────────────────────────

export function NewContractForm() {
  const [form,   setForm]   = useState<FormState>(INITIAL);
  const [stage,  setStage]  = useState<Stage>({ name: "idle" });
  const [errors, setErrors] = useState<FieldError>({});
  const firstErrorRef = useRef<HTMLDivElement>(null);

  // Selection tracking — UI-only; not included in API payload
  const [selectedClientId,   setSelectedClientId]   = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedPropertyId,   setSelectedPropertyId]   = useState<string | null>(null);
  const [selectedPropertyAddr, setSelectedPropertyAddr] = useState<string | null>(null);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev }; delete next[key]; return next;
    });
    setStage((s) => s.name === "error" ? { name: "idle" } : s);
  }, []);

  // ── Client selection handlers ─────────────────────────────────────────────
  function handleClientSelect(c: ApiClient) {
    setForm((prev) => ({
      ...prev,
      clientName:     c.name,
      clientPhone:    c.phone,
      clientEmail:    c.email    || "",
      clientIdNumber: c.idNumber || "",
    }));
    setSelectedClientId(c.id);
    setSelectedClientName(c.name);
    // Clear related field errors
    setErrors((prev) => {
      const next = { ...prev };
      delete next.clientName; delete next.clientPhone;
      delete next.clientEmail; delete next.clientIdNumber;
      return next;
    });
    setStage((s) => s.name === "error" ? { name: "idle" } : s);
  }

  function handleClientClear() {
    setForm((prev) => ({
      ...prev,
      clientName: "", clientPhone: "", clientEmail: "", clientIdNumber: "",
    }));
    setSelectedClientId(null);
    setSelectedClientName(null);
  }

  // ── Property selection handlers ───────────────────────────────────────────
  function handlePropertySelect(p: ApiProperty) {
    setForm((prev) => ({
      ...prev,
      propertyAddress: p.address,
      propertyCity:    p.city,
      // Prefill price only if askingPrice is set; leave existing value otherwise
      ...(p.askingPrice != null
        ? { priceNis: Math.round(p.askingPrice / 100).toString() }
        : {}),
    }));
    setSelectedPropertyId(p.id);
    setSelectedPropertyAddr(p.address);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.propertyAddress; delete next.propertyCity; delete next.priceNis;
      return next;
    });
    setStage((s) => s.name === "error" ? { name: "idle" } : s);
  }

  function handlePropertyClear() {
    setForm((prev) => ({
      ...prev,
      propertyAddress: "", propertyCity: "", priceNis: "",
    }));
    setSelectedPropertyId(null);
    setSelectedPropertyAddr(null);
  }

  // ── Commission preview ────────────────────────────────────────────────────
  const commAgorot = calcCommissionAgorot(form);
  const commPreview =
    !isNaN(commAgorot) && commAgorot >= 0
      ? `עמלת תיווך: ₪${fmtNis(commAgorot)}`
      : null;

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): FieldError {
    const e: FieldError = {};
    if (!form.clientName.trim())  e.clientName  = "שם לקוח הוא שדה חובה";
    if (!form.clientPhone.trim()) e.clientPhone = "טלפון לקוח הוא שדה חובה";
    if (!form.skipEmailId) {
      if (!form.clientEmail.trim())    e.clientEmail    = "אימייל לקוח הוא שדה חובה (או סמן 'אין לי כרגע')";
      if (!form.clientIdNumber.trim()) e.clientIdNumber = "תעודת זהות היא שדה חובה (או סמן 'אין לי כרגע')";
    }
    if (!form.propertyAddress.trim()) e.propertyAddress = "כתובת נכס היא שדה חובה";
    if (!form.propertyCity.trim())    e.propertyCity    = "עיר היא שדה חובה";
    const priceNis = parseNis(form.priceNis);
    if (isNaN(priceNis) || priceNis <= 0) {
      e.priceNis = form.dealType === "SALE" ? "מחיר הנכס חייב להיות מספר חיובי" : "מחיר שכירות חייב להיות מספר חיובי";
    }
    if (form.dealType === "SALE" && form.commissionMode === "percent") {
      const pct = parseFloat(form.commissionPct);
      if (isNaN(pct) || pct < 0 || pct > 100) e.commissionPct = "אחוז עמלה חייב להיות בין 0 ל-100";
    } else {
      const commNis = parseNis(form.commissionNis);
      if (isNaN(commNis) || commNis < 0) e.commissionNis = "עמלת תיווך חייבת להיות מספר חיובי או 0";
    }
    return e;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setTimeout(() => firstErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setStage({ name: "submitting" });
    const priceAgorot      = Math.round(parseNis(form.priceNis) * 100);
    const commissionAgorot = calcCommissionAgorot(form);
    const payload = {
      contractType:    "החתמת מתעניין",
      language:        form.language,
      dealType:        form.dealType,
      clientName:      form.clientName.trim(),
      clientPhone:     form.clientPhone.trim(),
      clientEmail:     form.skipEmailId ? "" : form.clientEmail.trim(),
      clientIdNumber:  form.skipEmailId ? "" : form.clientIdNumber.trim(),
      propertyAddress: form.propertyAddress.trim(),
      propertyCity:    form.propertyCity.trim(),
      propertyPrice:   priceAgorot,
      commission:      commissionAgorot,
      // Pass existingClientDbId when broker picked an existing client,
      // so the API links the contract to the existing Client row instead
      // of creating a duplicate. The API already supports this field.
      ...(selectedClientId   ? { existingClientDbId: selectedClientId }   : {}),
      ...(selectedPropertyId ? { propertyId:          selectedPropertyId } : {}),
    };
    try {
      const res = await fetch("/api/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת החוזה");
      }
      const contract = await res.json();
      setStage({ name: "success", contractId: contract.id, signatureToken: contract.signatureToken, clientName: form.clientName.trim() });
    } catch (err) {
      setStage({ name: "error", message: err instanceof Error ? err.message : "שגיאה לא ידועה" });
    }
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (stage.name === "success") {
    return (
      <SuccessScreen
        contractId={stage.contractId}
        signatureToken={stage.signatureToken}
        clientName={stage.clientName}
        onCreateAnother={() => {
          setForm(INITIAL); setErrors({}); setStage({ name: "idle" });
          setSelectedClientId(null); setSelectedClientName(null);
          setSelectedPropertyId(null); setSelectedPropertyAddr(null);
        }}
      />
    );
  }

  const submitting = stage.name === "submitting";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pb-28" dir="rtl">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">חוזה חדש</h1>
        <p className="text-sm text-gray-500 mt-1">מלא את הפרטים ושלח לחתימה בלחיצה אחת</p>
      </div>

      <div className="space-y-5">

        {/* ══ 1. Contract type ══════════════════════════════════════════════ */}
        <Section title="סוג חוזה">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONTRACT_TYPES.map((ct) => {
              const selected = ct.id === "interested";
              return (
                <div key={ct.id} className={[
                  "flex items-start gap-4 p-4 rounded-xl border transition-all",
                  ct.active && selected ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-300"
                    : ct.active ? "border-gray-200 bg-white cursor-pointer hover:border-indigo-200"
                    : "border-gray-100 bg-gray-50/70 opacity-55 cursor-not-allowed select-none",
                ].join(" ")}>
                  <div className={[
                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                    ct.active ? ct.iconBg : "bg-gray-100 text-gray-300",
                  ].join(" ")}>{ct.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className={["text-sm font-bold leading-snug", ct.active ? "text-gray-900" : "text-gray-400"].join(" ")}>{ct.label}</p>
                    <p className={["text-xs mt-0.5 leading-relaxed", ct.active ? "text-gray-500" : "text-gray-400"].join(" ")}>{ct.subtitle}</p>
                    {!ct.active && (
                      <span className="inline-flex mt-1.5 items-center text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">בקרוב</span>
                    )}
                  </div>
                  {ct.active && selected && (
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 6 5 9 10 3" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ══ 2. Language ═══════════════════════════════════════════════════ */}
        <Section title="שפת החוזה" subtitle="השפה בה יוצג החוזה ללקוח">
          <div className="flex flex-wrap gap-2.5">
            {LANGS.map((lang) => {
              const active = form.language === lang.id;
              return (
                <button key={lang.id} type="button" onClick={() => set("language", lang.id)}
                  className={[
                    "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                    active ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                           : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30",
                  ].join(" ")}>
                  <span>{lang.flag}</span><span>{lang.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ══ 3. Client details ═════════════════════════════════════════════ */}
        <Section title="פרטי לקוח">
          <div className="space-y-4" ref={firstErrorRef}>

            {/* Existing client picker */}
            <ClientPicker
              selectedName={selectedClientName}
              onSelect={handleClientSelect}
              onClear={handleClientClear}
            />

            {/* Manual fields — always editable */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="clientName">שם לקוח</FieldLabel>
                <TextInput id="clientName" value={form.clientName} onChange={(v) => set("clientName", v)}
                  placeholder="ישראל ישראלי" error={errors.clientName} />
              </div>
              <div>
                <FieldLabel htmlFor="clientPhone">טלפון לקוח</FieldLabel>
                <TextInput id="clientPhone" value={form.clientPhone} onChange={(v) => set("clientPhone", v)}
                  placeholder="050-0000000" type="tel" error={errors.clientPhone} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="clientEmail" optional={form.skipEmailId}>אימייל לקוח</FieldLabel>
                <TextInput id="clientEmail" value={form.clientEmail} onChange={(v) => set("clientEmail", v)}
                  placeholder="client@example.com" type="email" disabled={form.skipEmailId} error={errors.clientEmail} />
              </div>
              <div>
                <FieldLabel htmlFor="clientIdNumber" optional={form.skipEmailId}>תעודת זהות לקוח</FieldLabel>
                <TextInput id="clientIdNumber" value={form.clientIdNumber} onChange={(v) => set("clientIdNumber", v)}
                  placeholder="000000000" disabled={form.skipEmailId} error={errors.clientIdNumber} />
              </div>
            </div>

            {/* Skip checkbox */}
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input type="checkbox" checked={form.skipEmailId}
                  onChange={(e) => {
                    set("skipEmailId", e.target.checked);
                    if (e.target.checked) {
                      setErrors((prev) => { const n = { ...prev }; delete n.clientEmail; delete n.clientIdNumber; return n; });
                    }
                  }}
                  className="sr-only" />
                <div className={["w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                  form.skipEmailId ? "bg-indigo-600 border-indigo-600" : "bg-white border-gray-300 group-hover:border-indigo-400",
                ].join(" ")}>
                  {form.skipEmailId && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">אין לי כרגע ת״ז / מייל — הלקוח ישלים לפני החתימה</p>
                <p className="text-xs text-gray-400 mt-0.5">הלקוח יתבקש להשלים פרטים אלו לפני שיוכל לחתום על החוזה</p>
              </div>
            </label>
          </div>
        </Section>

        {/* ══ 4. Property details ═══════════════════════════════════════════ */}
        <Section title="פרטי נכס">

          {/* Existing property picker */}
          <PropertyPicker
            selectedAddress={selectedPropertyAddr}
            onSelect={handlePropertySelect}
            onClear={handlePropertyClear}
          />

          {/* Manual fields — always editable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="propertyAddress">כתובת נכס</FieldLabel>
              <TextInput id="propertyAddress" value={form.propertyAddress} onChange={(v) => set("propertyAddress", v)}
                placeholder="רחוב הרצל 1" error={errors.propertyAddress} />
            </div>
            <div>
              <FieldLabel htmlFor="propertyCity">עיר</FieldLabel>
              <TextInput id="propertyCity" value={form.propertyCity} onChange={(v) => set("propertyCity", v)}
                placeholder="תל אביב" error={errors.propertyCity} />
            </div>
          </div>
        </Section>

        {/* ══ 5. Deal type ══════════════════════════════════════════════════ */}
        {/* NOTE: schema/API support one DealType per contract (SALE | RENTAL). */}
        <Section title="סוג עסקה" subtitle="בחר סוג עסקה אחד לחוזה זה">
          <div className="flex gap-3">
            {(["SALE", "RENTAL"] as const).map((dt) => {
              const label = dt === "SALE" ? "מכירה" : "שכירות";
              const icon  = dt === "SALE"
                ? (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><rect x="9" y="13" width="6" height="8" rx="0.5" />
                  </svg>)
                : (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 21V10M16 21V10M3 9h18" />
                  </svg>);
              return (
                <button key={dt} type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, dealType: dt, priceNis: "", commissionNis: "", commissionPct: "" }));
                    setErrors((prev) => { const n = { ...prev }; delete n.priceNis; delete n.commissionNis; delete n.commissionPct; return n; });
                    setStage((s) => s.name === "error" ? { name: "idle" } : s);
                  }}
                  className={[
                    "flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-semibold transition-all",
                    form.dealType === dt
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                  ].join(" ")}>
                  {icon}{label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ══ 6. Financial ══════════════════════════════════════════════════ */}
        <Section title="פרטים פיננסיים" subtitle={form.dealType === "SALE" ? "עסקת מכירה" : "עסקת שכירות"}>
          <div className="space-y-5">
            <div>
              <FieldLabel htmlFor="priceNis">
                {form.dealType === "SALE" ? "מחיר הנכס (₪)" : "שכירות חודשית (₪)"}
              </FieldLabel>
              <TextInput id="priceNis" value={form.priceNis} onChange={(v) => set("priceNis", v)}
                placeholder={form.dealType === "SALE" ? "1,500,000" : "5,000"} error={errors.priceNis} />
            </div>
            <div>
              <FieldLabel>עמלת תיווך</FieldLabel>
              {form.dealType === "SALE" && (
                <div className="flex gap-2 mb-3">
                  {(["percent", "fixed"] as const).map((mode) => (
                    <button key={mode} type="button"
                      onClick={() => {
                        set("commissionMode", mode);
                        setErrors((prev) => { const n = { ...prev }; delete n.commissionNis; delete n.commissionPct; return n; });
                      }}
                      className={[
                        "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                        form.commissionMode === mode
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
                      ].join(" ")}>
                      {mode === "percent" ? "אחוז (%)" : "סכום קבוע (₪)"}
                    </button>
                  ))}
                </div>
              )}
              {form.dealType === "SALE" && form.commissionMode === "percent" ? (
                <div>
                  <TextInput id="commissionPct" value={form.commissionPct} onChange={(v) => set("commissionPct", v)}
                    placeholder="2" error={errors.commissionPct} />
                  <p className="text-xs text-gray-400 mt-1">לדוגמה: 2 = 2% ממחיר הנכס</p>
                </div>
              ) : (
                <div>
                  <TextInput id="commissionNis" value={form.commissionNis} onChange={(v) => set("commissionNis", v)}
                    placeholder="11,000" error={errors.commissionNis} />
                  <p className="text-xs text-gray-400 mt-1">הזן 0 לעמלת תיווך ללא עלות</p>
                </div>
              )}
              {commPreview && (
                <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-700">{commPreview}</span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Error banner */}
        {stage.name === "error" && (
          <div className="flex items-start gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium">{stage.message}</p>
          </div>
        )}

      </div>

      {/* Sticky submit bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3 justify-end">
          {Object.keys(errors).length > 0 && (
            <p className="text-xs text-red-500 flex-1">יש לתקן {Object.keys(errors).length} שדות לפני השליחה</p>
          )}
          <Link href="/dashboard"
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
            ביטול
          </Link>
          <button type="button" onClick={handleSubmit} disabled={submitting}
            className={[
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
              submitting ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200",
            ].join(" ")}>
            {submitting ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                שולח...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                שלח חוזה לחתימה
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
