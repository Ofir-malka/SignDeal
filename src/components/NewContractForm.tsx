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
import { parsePropertyAddress } from "@/lib/format-address";
import { formatNisInput } from "@/lib/format-nis";

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
  floor:       number | null;  // null when not set
  askingPrice: number | null;  // agorot; null when not set
  listingType: string;
}

// ── Form types ─────────────────────────────────────────────────────────────────

type Lang                   = "HE" | "EN" | "FR" | "RU";
type DealType               = "SALE" | "RENTAL" | "BOTH";
type CommissionMode         = "fixed" | "percent";
type RentalCommissionPreset = "one_month" | "fixed";

interface FormState {
  language:          Lang;
  clientName:        string;
  clientPhone:       string;
  clientEmail:       string;
  clientIdNumber:    string;
  skipEmailId:       boolean;
  // ── Structured property address ───────────────────────────────────────────
  // Street + number are stored in `propertyAddress` as "<street> <number>".
  // Floor and apartment are appended with "||" separators and rendered as
  // separate rows in the contract table (not part of the address string).
  // When an existing property is selected via the picker, `propertyStreet`
  // receives the full stored address and the other sub-fields are left empty.
  propertyStreet:              string;   // street name (required)
  propertyNumber:              string;   // building number — can contain letters, e.g. "15א"
  propertyFloor:               string;   // optional; integer-parseable
  propertyApartment:           string;   // optional; apartment / unit identifier
  propertyCity:                string;
  hideFullAddressFromClient:   boolean;  // hide building number from client until signed
  dealType:                    DealType;
  priceNis:                    string;
  commissionMode:              CommissionMode;
  commissionNis:               string;
  commissionPct:               string;
  rentalCommissionPreset:      RentalCommissionPreset;
  // ── Sale-side commission (BOTH only) ─────────────────────────────────────
  commissionSaleMode: CommissionMode;
  commissionSaleNis:  string;   // BOTH + fixed: sale commission amount in ₪
  commissionSalePct:  string;   // BOTH + percent: sale commission percentage
  salePriceNis:       string;   // BOTH + percent: asking price used to calc % (not stored in DB)
}

type Stage =
  | { name: "idle" }
  | { name: "submitting" }
  | { name: "success"; contractId: string; signatureToken: string; clientName: string }
  | { name: "error"; message: string };

interface FieldError { [key: string]: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL: FormState = {
  language:                  "HE",
  clientName:                "",
  clientPhone:               "",
  clientEmail:               "",
  clientIdNumber:            "",
  skipEmailId:               false,
  propertyStreet:            "",
  propertyNumber:            "",
  propertyFloor:             "",
  propertyApartment:         "",
  propertyCity:              "",
  hideFullAddressFromClient: false,
  dealType:                  "SALE",
  priceNis:                  "",
  commissionMode:            "percent",
  commissionNis:             "",
  commissionPct:             "",
  rentalCommissionPreset:    "one_month",
  commissionSaleMode:        "percent",
  commissionSaleNis:         "",
  commissionSalePct:         "",
  salePriceNis:              "",
};

const LANGS: { id: Lang; flag: string; label: string }[] = [
  { id: "HE", flag: "🇮🇱", label: "עברית"   },
  { id: "EN", flag: "🇺🇸", label: "English"  },
  { id: "FR", flag: "🇫🇷", label: "Français" },
  { id: "RU", flag: "🇷🇺", label: "Русский"  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Split a clean Hebrew street address into street name and house/building number.
 *
 * Israeli address convention: "<street name> <number>[suffix]"
 * The number is the last whitespace-separated token and matches /^\d+[א-תa-zA-Z]?$/
 * (plain digits, optionally followed by a single Hebrew or Latin letter).
 *
 * Examples:
 *   "רוטשילד 42"         → { street: "רוטשילד",        number: "42"   }
 *   "הרצל 15א"           → { street: "הרצל",            number: "15א"  }
 *   "שדרות רוטשילד 10"   → { street: "שדרות רוטשילד",  number: "10"   }
 *   "רוטשילד"            → { street: "רוטשילד",        number: ""     }  (no number)
 *   "12"                 → { street: "12",              number: ""     }  (only digits — keep as-is)
 */
function splitHebrewAddress(addr: string): { street: string; number: string } {
  const trimmed = addr.trim();
  // Match: everything up to the last whitespace + a number token (digits + optional letter suffix)
  const m = trimmed.match(/^(.+)\s+(\d+[א-תa-zA-Z]?)$/);
  if (!m) return { street: trimmed, number: "" };
  return { street: m[1].trim(), number: m[2] };
}

function parseNis(raw: string): number {
  return parseFloat(raw.replace(/[, ]/g, ""));
}

function fmtNis(agorot: number): string {
  return Math.round(agorot / 100).toLocaleString("he-IL");
}

/**
 * Build the structured address string stored in Contract.propertyAddress.
 *
 * Format: "<street> <number>||<floor>||<apartment>"
 *  • Street + number go into the address row of the contract table.
 *  • Floor and apartment are encoded after "||" separators so ContractTemplate
 *    and ContractPDF can render them as separate labeled rows.
 *  • City is always sent separately as `propertyCity` — never part of this string.
 *  • The "||" separator is safe in Hebrew addresses (never used in practice).
 *
 * Examples:
 *   street="רוטשילד" number="15" floor="4" apt="8" → "רוטשילד 15||4||8"
 *   street="הרצל"    number="22" floor=""  apt=""  → "הרצל 22"  (no separators)
 *   street="הרצל"    number=""   floor="3" apt=""  → "הרצל||3||"
 */
function buildPropertyAddress(f: FormState): string {
  const street = f.propertyStreet.trim();
  if (!street) return "";
  const num   = f.propertyNumber.trim();
  const floor = f.propertyFloor.trim();
  const apt   = f.propertyApartment.trim();

  const baseAddr = num ? `${street} ${num}` : street;
  if (!floor && !apt) return baseAddr;
  return `${baseAddr}||${floor}||${apt}`;
}

/**
 * Rental commission (or full commission for SALE/RENTAL).
 * For BOTH: this is the rental-side commission only.
 */
function calcCommissionAgorot(f: FormState): number {
  const priceNis = parseNis(f.priceNis);
  if (f.dealType === "SALE" && f.commissionMode === "percent") {
    const pct = parseFloat(f.commissionPct);
    if (isNaN(priceNis) || isNaN(pct)) return NaN;
    return Math.round(priceNis * pct);   // priceNis(₪) × pct(%) = commission in agorot
  }
  // RENTAL and BOTH — "one_month" preset: commission = 1 × monthly rent
  if ((f.dealType === "RENTAL" || f.dealType === "BOTH") && f.rentalCommissionPreset !== "fixed") {
    if (isNaN(priceNis)) return NaN;
    return Math.round(priceNis * 100);
  }
  const commNis = parseNis(f.commissionNis);
  return isNaN(commNis) ? NaN : Math.round(commNis * 100);
}

/**
 * Sale-side commission — only used when dealType === "BOTH".
 * salePriceNis (asking price) is a local-only field used for % calc; not stored in DB.
 */
function calcCommissionSaleAgorot(f: FormState): number {
  if (f.dealType !== "BOTH") return NaN;
  if (f.commissionSaleMode === "percent") {
    const salePriceNis = parseNis(f.salePriceNis);
    const pct          = parseFloat(f.commissionSalePct);
    if (isNaN(salePriceNis) || isNaN(pct)) return NaN;
    return Math.round(salePriceNis * pct); // salePriceNis(₪) × pct(%) = agorot
  }
  const commNis = parseNis(f.commissionSaleNis);
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

  const [isMobile, setIsMobile] = useState(false);

  // Detect touch-primary device once on mount (SSR-safe: starts false).
  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  /** Recompute fixed-position coordinates — desktop only (no-op on mobile). */
  function recomputePos() {
    if (isMobile || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({
      top:      rect.bottom + 4,
      right:    window.innerWidth - rect.right,
      minWidth: Math.min(Math.max(rect.width, 220), window.innerWidth - 32),
    });
  }

  // ── Fetch on first open ───────────────────────────────────────────────────────

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

  // ── Outside-tap / outside-click — desktop only ───────────────────────────────
  // On mobile the sheet uses its own backdrop div for tap-to-close, so we must
  // NOT run this listener there: the sheet's DOM is outside dropdownRef (which
  // is null on mobile), so every tap inside the sheet would look like an
  // "outside click" and immediately re-close it.

  useEffect(() => {
    if (!open) return;
    if (isMobile) return;   // ← mobile: backdrop handles close, not document mousedown

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
  }, [open, isMobile]);

  // ── Escape key ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Scroll-to-close — desktop only ───────────────────────────────────────────
  // On touch devices (pointer: coarse) we intentionally skip this listener so
  // the picker survives natural finger scrolling and virtual-keyboard-induced
  // viewport shifts. Outside-tap already handles dismissal on mobile.
  // On desktop (pointer: fine) we keep the 300ms debounce from the previous
  // fix as a safety net against sub-pixel scroll noise on trackpads.

  useEffect(() => {
    if (!open) return;
    if (isMobile) return;          // ← mobile: no scroll-to-close

    const openedAt = Date.now();
    function onScroll() {
      if (Date.now() - openedAt < 300) return;
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, isMobile]);

  // ── Viewport-resize position tracking — desktop only ─────────────────────────
  // On desktop, the virtual keyboard doesn't exist and window/visualViewport
  // resize only happens when the user resizes the browser. We recompute the
  // fixed-position coordinates so the dropdown stays anchored to the trigger.
  // On mobile we skip this entirely: the sheet layout is viewport-relative
  // (inset-x-3, top-[8%]) and needs no repositioning math.

  useEffect(() => {
    if (!open) return;
    if (isMobile) return;   // ← mobile: sheet is static, no repositioning needed

    const vv = window.visualViewport;   // null in some older browsers
    if (vv) {
      vv.addEventListener("resize", recomputePos);
      vv.addEventListener("scroll", recomputePos);
    }
    window.addEventListener("resize", recomputePos);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", recomputePos);
        vv.removeEventListener("scroll", recomputePos);
      }
      window.removeEventListener("resize", recomputePos);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  function openPicker() {
    if (!isMobile && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top:      rect.bottom + 4,
        right:    window.innerWidth - rect.right,
        minWidth: Math.min(Math.max(rect.width, 220), window.innerWidth - 32),
      });
    }
    setOpen(true);
    setQuery("");
  }

  function close() { setOpen(false); setQuery(""); }

  const items = fetched.status === "ready" ? fetched.items : [];

  return { open, openPicker, close, query, setQuery, fetched, items, triggerRef, dropdownRef, dropPos, isMobile };
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

  // ── Ranked search ────────────────────────────────────────────────────────────
  // Scoring (higher = better match):
  //   4 — name startsWith query
  //   3 — phone digits startsWith query digits
  //   2 — name includes query
  //   1 — phone digits includes query digits
  // Items with score 0 are filtered out. Empty query shows all items unsorted.
  const q    = picker.query.trim().toLowerCase();
  const qDig = q.replace(/\D/g, "");   // digits only (empty when query has none)

  const filtered = q === ""
    ? picker.items
    : picker.items
        .map((c) => {
          const name  = c.name.toLowerCase();
          const phone = c.phone.replace(/\D/g, "");
          let score = 0;
          if (name.startsWith(q))                   score = 4;
          else if (qDig && phone.startsWith(qDig))  score = 3;
          else if (name.includes(q))                score = 2;
          else if (qDig && phone.includes(qDig))    score = 1;
          return { c, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ c }) => c);

  return (
    <div className="mb-4">
      {/* Trigger / selected chip */}
      {selectedName ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm w-fit max-w-full">
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
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-gray-300 text-base sm:text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          בחירת לקוח קיים
        </button>
      )}

      {/* Dropdown — mobile sheet OR desktop floating panel */}
      {picker.open && (
        picker.isMobile ? (
          /* ── Mobile: full-viewport modal sheet ──────────────────────────
             The sheet is a CHILD of the backdrop (not a sibling) so that
             onClick={(e) => e.stopPropagation()} on the sheet panel stops
             taps inside the sheet from bubbling to the backdrop's close
             handler. On iOS, sibling fixed elements at the same z-index can
             have ambiguous touch routing; parent-child + stopPropagation is
             reliable across all mobile browsers.                          ── */
          <div className="fixed inset-0 z-50 bg-black/40" onClick={picker.close}>
            <div
              className="fixed inset-x-3 z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ top: "8%", maxHeight: "80vh" }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-900">בחירת לקוח קיים</span>
                <button type="button" onClick={picker.close}
                  className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="סגור">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={picker.query}
                    onChange={(e) => picker.setQuery(e.target.value)}
                    placeholder="חפש לפי שם או טלפון..."
                    className="w-full pe-8 ps-3 py-2 text-base rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
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
          </div>
        ) : (
          /* ── Desktop: fixed-position floating dropdown ── */
          picker.dropPos && (
            <div
              ref={picker.dropdownRef}
              style={{
                position:  "fixed",
                top:       picker.dropPos.top,
                right:     picker.dropPos.right,
                minWidth:  picker.dropPos.minWidth,
                maxWidth:  "calc(100vw - 32px)",
                zIndex:    9999,
              }}
              className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
              dir="rtl"
            >
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
                    className="w-full pe-8 ps-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
              </div>
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
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
          )
        )
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

  // ── Ranked search ────────────────────────────────────────────────────────────
  // Scoring (higher = better match):
  //   4 — address startsWith query
  //   3 — city startsWith query
  //   2 — address includes query
  //   1 — city includes query
  // Items with score 0 are filtered out. Empty query shows all items unsorted.
  const q = picker.query.trim().toLowerCase();

  const filtered = q === ""
    ? picker.items
    : picker.items
        .map((p) => {
          const addr = p.address.toLowerCase();
          const city = p.city.toLowerCase();
          let score = 0;
          if (addr.startsWith(q))      score = 4;
          else if (city.startsWith(q)) score = 3;
          else if (addr.includes(q))   score = 2;
          else if (city.includes(q))   score = 1;
          return { p, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ p }) => p);

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
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-gray-300 text-base sm:text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <rect x="9" y="13" width="6" height="8" rx="0.5" />
          </svg>
          בחירת נכס קיים
        </button>
      )}

      {/* Dropdown — mobile sheet OR desktop floating panel */}
      {picker.open && (
        picker.isMobile ? (
          /* ── Mobile: full-viewport modal sheet ── (see ClientPicker comment) ── */
          <div className="fixed inset-0 z-50 bg-black/40" onClick={picker.close}>
            <div
              className="fixed inset-x-3 z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ top: "8%", maxHeight: "80vh" }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-900">בחירת נכס קיים</span>
                <button type="button" onClick={picker.close}
                  className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="סגור">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="absolute top-1/2 -translate-y-1/2 end-3 pointer-events-none">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={picker.query}
                    onChange={(e) => picker.setQuery(e.target.value)}
                    placeholder="חפש לפי כתובת או עיר..."
                    className="w-full pe-8 ps-3 py-2 text-base rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
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
                      <p className="text-sm font-semibold text-gray-900 truncate">{parsePropertyAddress(p.address).address}</p>
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
          </div>
        ) : (
          /* ── Desktop: fixed-position floating dropdown ── */
          picker.dropPos && (
            <div
              ref={picker.dropdownRef}
              style={{
                position:  "fixed",
                top:       picker.dropPos.top,
                right:     picker.dropPos.right,
                minWidth:  picker.dropPos.minWidth,
                maxWidth:  "calc(100vw - 32px)",
                zIndex:    9999,
              }}
              className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
              dir="rtl"
            >
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
                    className="w-full pe-8 ps-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
                  />
                </div>
              </div>
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
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
                      <p className="text-sm font-semibold text-gray-900 truncate">{parsePropertyAddress(p.address).address}</p>
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
          )
        )
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
          "w-full px-3.5 py-2.5 rounded-xl border text-base sm:text-sm text-gray-900",
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

// ── Shared commission preview chip ────────────────────────────────────────────

function CommissionPreviewChip({ label }: { label: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="text-sm font-semibold text-emerald-700">{label}</span>
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
    // Step 1: decode the "street||floor||apt" encoding (new format).
    // Legacy records have no "||" — parsePropertyAddress returns the full
    // string as `address` with empty floor/apartment.
    const parsed = parsePropertyAddress(p.address);

    // Step 2: split the clean address into street name + house number.
    // "רוטשילד 42" → street "רוטשילד", number "42"
    // "שדרות רוטשילד 10" → street "שדרות רוטשילד", number "10"
    // If splitting fails (e.g. address has no number), keep full in street.
    const { street, number } = splitHebrewAddress(parsed.address);

    setForm((prev) => ({
      ...prev,
      propertyStreet:    street,
      propertyNumber:    number,
      // Floor: prefer the value encoded in the address (new format);
      // fall back to the numeric Property.floor column (legacy); otherwise empty.
      propertyFloor:     parsed.floor || (p.floor != null ? String(p.floor) : ""),
      propertyApartment: parsed.apartment,
      propertyCity:      p.city,
      // Prefill price only when askingPrice is set; leave existing value otherwise
      ...(p.askingPrice != null
        ? { priceNis: Math.round(p.askingPrice / 100).toString() }
        : {}),
    }));
    setSelectedPropertyId(p.id);
    setSelectedPropertyAddr(parsed.address);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.propertyStreet; delete next.propertyCity; delete next.priceNis;
      return next;
    });
    setStage((s) => s.name === "error" ? { name: "idle" } : s);
  }

  function handlePropertyClear() {
    setForm((prev) => ({
      ...prev,
      propertyStreet: "", propertyNumber: "", propertyFloor: "",
      propertyApartment: "", propertyCity: "", priceNis: "",
    }));
    setSelectedPropertyId(null);
    setSelectedPropertyAddr(null);
  }

  // ── Commission preview ────────────────────────────────────────────────────
  const commAgorot     = calcCommissionAgorot(form);
  const commSaleAgorot = calcCommissionSaleAgorot(form);
  // BOTH shows two separate previews; SALE/RENTAL show a single line
  const commPreview =
    !isNaN(commAgorot) && commAgorot >= 0 && form.dealType !== "BOTH"
      ? `עמלת תיווך: ₪${fmtNis(commAgorot)}`
      : null;
  const commRentalPreview =
    form.dealType === "BOTH" && !isNaN(commAgorot) && commAgorot >= 0
      ? `עמלת שכירות: ₪${fmtNis(commAgorot)}`
      : null;
  const commSalePreview =
    form.dealType === "BOTH" && !isNaN(commSaleAgorot) && commSaleAgorot >= 0
      ? `עמלת מכירה: ₪${fmtNis(commSaleAgorot)}`
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
    if (!form.propertyStreet.trim()) e.propertyStreet = "שם רחוב הוא שדה חובה";
    if (!form.propertyCity.trim())   e.propertyCity   = "עיר היא שדה חובה";
    const priceNis = parseNis(form.priceNis);
    if (isNaN(priceNis) || priceNis <= 0) {
      e.priceNis = form.dealType === "SALE"
        ? "מחיר הנכס חייב להיות מספר חיובי"
        : "שכירות חודשית חייבת להיות מספר חיובי";
    }
    // ── Rental commission (RENTAL + BOTH) ────────────────────────────────────
    if (form.dealType === "SALE" && form.commissionMode === "percent") {
      const pct = parseFloat(form.commissionPct);
      if (isNaN(pct) || pct < 0 || pct > 100) e.commissionPct = "אחוז עמלה חייב להיות בין 0 ל-100";
    } else if ((form.dealType === "RENTAL" || form.dealType === "BOTH") && form.rentalCommissionPreset !== "fixed") {
      // preset auto-calculates from monthly rent — no manual input to validate
    } else {
      const commNis = parseNis(form.commissionNis);
      if (isNaN(commNis) || commNis < 0) e.commissionNis = "עמלת תיווך חייבת להיות מספר חיובי או 0";
    }
    // ── Sale commission (BOTH only) ───────────────────────────────────────────
    if (form.dealType === "BOTH") {
      if (form.commissionSaleMode === "percent") {
        const salePriceNis = parseNis(form.salePriceNis);
        if (isNaN(salePriceNis) || salePriceNis <= 0) e.salePriceNis = "מחיר מכירה חייב להיות מספר חיובי";
        const pct = parseFloat(form.commissionSalePct);
        if (isNaN(pct) || pct < 0 || pct > 100) e.commissionSalePct = "אחוז עמלה למכירה חייב להיות בין 0 ל-100";
      } else {
        const commSaleNis = parseNis(form.commissionSaleNis);
        if (isNaN(commSaleNis) || commSaleNis < 0) e.commissionSaleNis = "עמלת מכירה חייבת להיות מספר חיובי או 0";
      }
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
    const priceAgorot          = Math.round(parseNis(form.priceNis) * 100);
    const commissionAgorot     = calcCommissionAgorot(form);
    const commissionSaleAgorot = form.dealType === "BOTH" ? calcCommissionSaleAgorot(form) : null;
    const propertyAddress      = buildPropertyAddress(form);

    // ── Auto-save new property ────────────────────────────────────────────────
    // When the broker didn't select an existing property from the picker,
    // create a new Property record so it appears in future searches.
    // POST /api/properties already exists and requires address + city + type.
    // We default type to "OTHER" since the contract form doesn't ask for it.
    // This is best-effort: if property save fails, contract creation continues
    // (the address string is still stored on the contract).
    let resolvedPropertyId = selectedPropertyId;
    if (!resolvedPropertyId && form.propertyStreet.trim() && form.propertyCity.trim()) {
      try {
        const floorNum = parseInt(form.propertyFloor.trim(), 10);
        const propPayload: Record<string, unknown> = {
          address:     propertyAddress,
          city:        form.propertyCity.trim(),
          type:        "OTHER",
          listingType: form.dealType === "SALE" ? "SALE" : form.dealType === "BOTH" ? "BOTH" : "RENTAL",
          ...(Number.isInteger(floorNum) && form.propertyFloor.trim() !== ""
            ? { floor: floorNum }
            : {}),
          // Save price for all deal types: sale price for SALE, monthly rent for RENTAL/BOTH
          ...(priceAgorot > 0 ? { askingPrice: priceAgorot } : {}),
        };
        const propRes = await fetch("/api/properties", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(propPayload),
        });
        if (propRes.ok) {
          const saved = await propRes.json() as { id: string };
          resolvedPropertyId = saved.id;
        }
      } catch {
        // Silently continue — contract creation is the primary action.
      }
    }

    const payload = {
      contractType:              "החתמת מתעניין",
      language:                  form.language,
      dealType:                  form.dealType,
      clientName:                form.clientName.trim(),
      clientPhone:               form.clientPhone.trim(),
      clientEmail:               form.skipEmailId ? "" : form.clientEmail.trim(),
      clientIdNumber:            form.skipEmailId ? "" : form.clientIdNumber.trim(),
      propertyAddress,
      propertyCity:              form.propertyCity.trim(),
      propertyPrice:             priceAgorot,
      commission:                commissionAgorot,
      ...(commissionSaleAgorot !== null ? { commissionSale: commissionSaleAgorot } : {}),
      hideFullAddressFromClient: form.hideFullAddressFromClient,
      // Pass existingClientDbId when broker picked an existing client so the
      // API links the contract to the existing Client row (no duplicate).
      ...(selectedClientId   ? { existingClientDbId: selectedClientId }   : {}),
      ...(resolvedPropertyId ? { propertyId:         resolvedPropertyId } : {}),
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
    <div className="pb-28 overflow-x-hidden" dir="rtl">

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

        {/* ══ 2. Client details ═════════════════════════════════════════════ */}
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

        {/* ══ 4. Deal type ══════════════════════════════════════════════════ */}
        {/* Must appear before Property Details so the price field label
            ("מחיר הנכס" vs "שכירות חודשית") is correct when the broker
            reaches that section. */}
        <Section title="סוג עסקה" subtitle="בחר סוג עסקה אחד לחוזה זה">
          <div className="flex gap-3 flex-wrap">

            {/* השכרה */}
            <button type="button"
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  dealType: "RENTAL",
                  priceNis: "",
                  commissionNis: "",
                  commissionPct: "",
                  rentalCommissionPreset: "one_month",
                }));
                setErrors((prev) => { const n = { ...prev }; delete n.priceNis; delete n.commissionNis; delete n.commissionPct; return n; });
                setStage((s) => s.name === "error" ? { name: "idle" } : s);
              }}
              className={[
                "flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-semibold transition-all",
                form.dealType === "RENTAL"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
              ].join(" ")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 21V10M16 21V10M3 9h18" />
              </svg>
              השכרה
            </button>

            {/* מכירה */}
            <button type="button"
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  dealType: "SALE",
                  priceNis: "",
                  commissionNis: "",
                  commissionPct: "",
                  rentalCommissionPreset: "one_month",
                }));
                setErrors((prev) => { const n = { ...prev }; delete n.priceNis; delete n.commissionNis; delete n.commissionPct; return n; });
                setStage((s) => s.name === "error" ? { name: "idle" } : s);
              }}
              className={[
                "flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-semibold transition-all",
                form.dealType === "SALE"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
              ].join(" ")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><rect x="9" y="13" width="6" height="8" rx="0.5" />
              </svg>
              מכירה
            </button>

            {/* גם וגם */}
            <button type="button"
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  dealType: "BOTH",
                  priceNis: "",
                  commissionNis: "",
                  commissionPct: "",
                  commissionSaleNis: "",
                  commissionSalePct: "",
                  salePriceNis: "",
                  rentalCommissionPreset: "one_month",
                  commissionSaleMode: "percent",
                }));
                setErrors((prev) => {
                  const n = { ...prev };
                  delete n.priceNis; delete n.commissionNis; delete n.commissionPct;
                  delete n.commissionSaleNis; delete n.commissionSalePct; delete n.salePriceNis;
                  return n;
                });
                setStage((s) => s.name === "error" ? { name: "idle" } : s);
              }}
              className={[
                "flex items-center gap-2.5 px-5 py-3 rounded-xl border text-sm font-semibold transition-all",
                form.dealType === "BOTH"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
              ].join(" ")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><rect x="9" y="13" width="6" height="8" rx="0.5" />
                <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" stroke="none" opacity="0.3" />
              </svg>
              גם וגם
            </button>

          </div>
        </Section>

        {/* ══ 5. Property details ═══════════════════════════════════════════ */}
        {/* Appears after Deal Type so the price label ("מחיר הנכס" / "שכירות
            חודשית") is always correct when the broker reaches this section. */}
        <Section title="פרטי נכס">

          {/* Existing property picker */}
          <PropertyPicker
            selectedAddress={selectedPropertyAddr}
            onSelect={handlePropertySelect}
            onClear={handlePropertyClear}
          />

          {/* Structured address fields — always editable */}
          <div className="space-y-4">

            {/* Row 1: Street name (full-width) */}
            <div>
              <FieldLabel htmlFor="propertyStreet">שם רחוב</FieldLabel>
              <TextInput
                id="propertyStreet"
                value={form.propertyStreet}
                onChange={(v) => set("propertyStreet", v)}
                placeholder="הרצל"
                error={errors.propertyStreet}
              />
            </div>

            {/* Row 2: Building number · Floor · Apartment (3 equal columns) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="propertyNumber">מספר בית</FieldLabel>
                <TextInput
                  id="propertyNumber"
                  value={form.propertyNumber}
                  onChange={(v) => set("propertyNumber", v)}
                  placeholder="15"
                />
              </div>
              <div>
                <FieldLabel htmlFor="propertyFloor" optional>קומה</FieldLabel>
                <TextInput
                  id="propertyFloor"
                  value={form.propertyFloor}
                  onChange={(v) => set("propertyFloor", v)}
                  placeholder="3"
                />
              </div>
              <div>
                <FieldLabel htmlFor="propertyApartment" optional>דירה</FieldLabel>
                <TextInput
                  id="propertyApartment"
                  value={form.propertyApartment}
                  onChange={(v) => set("propertyApartment", v)}
                  placeholder="8"
                />
              </div>
            </div>

            {/* Row 3: City */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="propertyCity">עיר</FieldLabel>
                <TextInput
                  id="propertyCity"
                  value={form.propertyCity}
                  onChange={(v) => set("propertyCity", v)}
                  placeholder="תל אביב"
                  error={errors.propertyCity}
                />
              </div>
            </div>

            {/* Hide-address toggle */}
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <div className="relative mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.hideFullAddressFromClient}
                  onChange={(e) => set("hideFullAddressFromClient", e.target.checked)}
                />
                <div className={[
                  "w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
                  form.hideFullAddressFromClient
                    ? "bg-indigo-600 border-indigo-600"
                    : "bg-white border-gray-300 group-hover:border-indigo-400",
                ].join(" ")}>
                  {form.hideFullAddressFromClient && (
                    <svg className="text-white" width="9" height="9" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="3.5"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">הסתר כתובת נכס מהלקוח</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  הלקוח יראה רק שם הרחוב. הכתובת המלאה תוצג אוטומטית לאחר חתימה.
                </p>
              </div>
            </label>

            {/* Row 4: Property price(s)
                SALE   → "מחיר הנכס (₪)"      — stored as propertyPrice on Contract
                RENTAL → "שכירות חודשית (₪)"  — stored as propertyPrice on Contract
                BOTH   → monthly rent + sale price (salePriceNis is local state only) */}
            <div className={form.dealType === "BOTH" ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>

              {/* Monthly rent / asking price */}
              <div>
                <FieldLabel htmlFor="priceNis">
                  {form.dealType === "SALE" ? "מחיר הנכס (₪)" : "שכירות חודשית (₪)"}
                </FieldLabel>
                <TextInput
                  id="priceNis"
                  value={form.priceNis}
                  onChange={(v) => set("priceNis", formatNisInput(v))}
                  placeholder={form.dealType === "SALE" ? "1,500,000" : "5,000"}
                  error={errors.priceNis}
                />
              </div>

              {/* Sale price — only shown for BOTH; local form state, not stored in DB */}
              {form.dealType === "BOTH" && (
                <div>
                  <FieldLabel htmlFor="salePriceNis">מחיר מכירה (₪)</FieldLabel>
                  <TextInput
                    id="salePriceNis"
                    value={form.salePriceNis}
                    onChange={(v) => set("salePriceNis", formatNisInput(v))}
                    placeholder="1,500,000"
                    error={errors.salePriceNis}
                  />
                </div>
              )}

            </div>

            {/* Helper text — auto-save notice */}
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="flex-shrink-0 text-gray-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              אם זה נכס חדש, המערכת תשמור אותו אוטומטית לשימוש עתידי.
            </p>

          </div>
        </Section>

        {/* ══ 6. Financial ══════════════════════════════════════════════════ */}
        <Section title="עמלת תיווך">
          <div className="space-y-6">

            {/* ── RENTAL presets (shared between RENTAL and the rental half of BOTH) */}
            {(form.dealType === "RENTAL" || form.dealType === "BOTH") && (() => {
              const presets: { id: RentalCommissionPreset; label: string; sub?: string }[] = [
                { id: "one_month",   label: "חודש שכירות",    sub: "×1"   },
                { id: "fixed",       label: "סכום ידני (₪)"              },
              ];
              return (
                <div>
                  <FieldLabel>{form.dealType === "BOTH" ? "עמלת שכירות" : "עמלת תיווך"}</FieldLabel>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {presets.map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => {
                          set("rentalCommissionPreset", p.id);
                          setErrors((prev) => { const n = { ...prev }; delete n.commissionNis; return n; });
                        }}
                        className={[
                          "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                          form.rentalCommissionPreset === p.id
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                            : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                        ].join(" ")}>
                        {p.label}
                        {p.sub && (
                          <span className={[
                            "text-[10px] font-medium px-1 py-0.5 rounded",
                            form.rentalCommissionPreset === p.id ? "bg-indigo-100 text-indigo-500" : "bg-gray-100 text-gray-400",
                          ].join(" ")}>{p.sub}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {form.rentalCommissionPreset === "fixed" && (
                    <div>
                      <TextInput id="commissionNis" value={form.commissionNis} onChange={(v) => set("commissionNis", formatNisInput(v))}
                        placeholder="5,000" error={errors.commissionNis} />
                      <p className="text-xs text-gray-400 mt-1">הזן 0 לעמלת תיווך ללא עלות</p>
                    </div>
                  )}
                  {/* commRentalPreview is set for BOTH; commPreview is set for RENTAL (never both at once) */}
                  {commRentalPreview && <CommissionPreviewChip label={commRentalPreview} />}
                  {commPreview       && <CommissionPreviewChip label={commPreview} />}
                </div>
              );
            })()}

            {/* ── SALE commission (SALE only) ──────────────────────────────── */}
            {form.dealType === "SALE" && (
              <div>
                <FieldLabel>עמלת תיווך</FieldLabel>
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
                {form.commissionMode === "percent" ? (
                  <div>
                    <TextInput id="commissionPct" value={form.commissionPct} onChange={(v) => set("commissionPct", v)}
                      placeholder="2" error={errors.commissionPct} />
                    <p className="text-xs text-gray-400 mt-1">לדוגמה: 2 = 2% ממחיר הנכס</p>
                  </div>
                ) : (
                  <div>
                    <TextInput id="commissionNis" value={form.commissionNis} onChange={(v) => set("commissionNis", formatNisInput(v))}
                      placeholder="11,000" error={errors.commissionNis} />
                    <p className="text-xs text-gray-400 mt-1">הזן 0 לעמלת תיווך ללא עלות</p>
                  </div>
                )}
                {commPreview && <CommissionPreviewChip label={commPreview} />}
              </div>
            )}

            {/* ── Sale-side commission (BOTH only) ─────────────────────────── */}
            {form.dealType === "BOTH" && (
              <div className="border-t border-gray-100 pt-5">
                <FieldLabel>עמלת מכירה</FieldLabel>
                <div className="flex gap-2 mb-3">
                  {(["percent", "fixed"] as const).map((mode) => (
                    <button key={mode} type="button"
                      onClick={() => {
                        set("commissionSaleMode", mode);
                        setErrors((prev) => { const n = { ...prev }; delete n.commissionSaleNis; delete n.commissionSalePct; delete n.salePriceNis; return n; });
                      }}
                      className={[
                        "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                        form.commissionSaleMode === mode
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
                      ].join(" ")}>
                      {mode === "percent" ? "אחוז (%)" : "סכום קבוע (₪)"}
                    </button>
                  ))}
                </div>
                {form.commissionSaleMode === "percent" ? (
                  <div>
                    <TextInput id="commissionSalePct" value={form.commissionSalePct} onChange={(v) => set("commissionSalePct", v)}
                      placeholder="2" error={errors.commissionSalePct} />
                    <p className="text-xs text-gray-400 mt-1">
                      לדוגמה: 2 = 2% ממחיר המכירה{form.salePriceNis.trim() && !isNaN(parseFloat(form.salePriceNis.replace(/[, ]/g, "")))
                        ? ` (₪${form.salePriceNis.trim()})`
                        : " — הזן מחיר מכירה בפרטי הנכס"}
                    </p>
                  </div>
                ) : (
                  <div>
                    <TextInput id="commissionSaleNis" value={form.commissionSaleNis} onChange={(v) => set("commissionSaleNis", formatNisInput(v))}
                      placeholder="30,000" error={errors.commissionSaleNis} />
                    <p className="text-xs text-gray-400 mt-1">הזן 0 לעמלת מכירה ללא עלות</p>
                  </div>
                )}
                {commSalePreview && <CommissionPreviewChip label={commSalePreview} />}
              </div>
            )}

          </div>
        </Section>

        {/* ══ 7. Language ═══════════════════════════════════════════════════ */}
        {/* Intentionally placed last — language is rarely changed; keeping it
            here avoids distracting brokers from the primary deal fields. */}
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
