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
import { CONTRACT_TYPE } from "@/lib/contracts/contract-types";
import { addMonthsInclusive, exclusivityDuration, durationTextHe, isWholeMonths, fromInputValue, toInputValue } from "@/lib/contracts/exclusivity-dates";
import { parsePropertyAddress } from "@/lib/format-address";
import { formatNisInput } from "@/lib/format-nis";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import type { UsageData } from "@/components/UsageCard";

// ── Subscription status (passed from server page) ─────────────────────────────

/**
 * Passed from the server component (contracts/new/page.tsx) so the form
 * can show a contextual upgrade banner and disable the submit button without
 * a client-side API round-trip.  Shape mirrors ContractCreationCheck + planLabel.
 */
export interface SubscriptionStatus {
  allowed:          boolean;
  reason?:          "SUBSCRIPTION_INACTIVE" | "MONTHLY_LIMIT_REACHED";
  plan:             string;
  planLabel:        string;
  isTrialing:       boolean;
  isActive:         boolean;
  isExpired:        boolean;
  trialEndsAt:      string | null;
  monthlyDocCount:  number;
  monthlyDocLimit:  number | null;
  monthlyRemaining: number | null;
}

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
  // Broker cooperation only: Broker B's license number (optional). A document-
  // level Contract field — intentionally NOT one of the Client-record fields
  // above (editing it must not deselect a picked client).
  counterpartyBrokerLicense: string;
  // Broker cooperation only: which cooperation agreement is created. Sent as
  // coopType for the cooperation category only; the route resolves sharedPool →
  // BROKER_COOP_SHARED_POOL (default), eachSide → BROKER_COOP_EACH_SIDE,
  // buyerToSeller → BROKER_COOP_BUYER_TO_SELLER.
  coopType: "sharedPool" | "eachSide" | "buyerToSeller";
  // Buyer-to-seller subtype only: the required transfer percent of the deal
  // price (decimal string, e.g. "0.5", "1.5"); strictly parsed to a number at
  // submit. Hidden-but-preserved when another subtype is selected — the
  // payload gate guarantees it is only ever sent for buyerToSeller.
  brokerCoopTransferPercent: string;
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
  rentalCommissionMonths:      string;   // "1"–"12"; used by every months-based rental fee flow
  // ── Owner-exclusive rental only ───────────────────────────────────────────
  exclusivityStart:            string;   // "YYYY-MM-DD" (input value)
  exclusivityDurationMode:     "months" | "custom";
  exclusivityMonths:           string;   // quick-chip months ("1"|"3"|"6"|"12")
  exclusivityEndCustom:        string;   // "YYYY-MM-DD"; only in custom mode
  // Owner flow — which document(s) this signing creates:
  // serviceOnly: one service-order (fee) document; serviceWithExclusivity:
  // service-order + linked exclusivity package; exclusivityOnly: one standalone
  // OWNER_EXCLUSIVE_ONLY document (no owner fee obligation, fee fields hidden).
  ownerMode: "serviceOnly" | "serviceWithExclusivity" | "exclusivityOnly";
  // ── Sale-side commission (BOTH only) ─────────────────────────────────────
  commissionSaleMode: CommissionMode;
  commissionSaleNis:  string;   // BOTH + fixed: sale commission amount in ₪
  commissionSalePct:  string;   // BOTH + percent: sale commission percentage
  salePriceNis:       string;   // BOTH + percent: asking price used to calc % (not stored in DB)
}

type Stage =
  | { name: "idle" }
  | { name: "submitting" }
  | { name: "success"; contractId: string; signatureToken: string; clientName: string;
      // Owner two-document package — present when the exclusivity secondary was created
      exclusivity?: { contractId: string; signatureToken: string } | null }
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
  counterpartyBrokerLicense: "",
  coopType:                  "sharedPool",
  brokerCoopTransferPercent: "",
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
  rentalCommissionMonths:    "1",
  exclusivityStart:          "",
  exclusivityDurationMode:   "months",
  exclusivityMonths:         "3",
  exclusivityEndCustom:      "",
  ownerMode:                 "serviceOnly",
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
  // RENTAL and BOTH — months preset: commission = N × monthly rent.
  // Every months-based rental flow (interested rental, the rental half of BOTH
  // and owner-exclusive rental) exposes a 1-12 selector.
  if ((f.dealType === "RENTAL" || f.dealType === "BOTH") && f.rentalCommissionPreset !== "fixed") {
    if (isNaN(priceNis)) return NaN;
    const months = parseInt(f.rentalCommissionMonths, 10);
    return Math.round(priceNis * 100 * (Number.isInteger(months) && months >= 1 ? months : 1));
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
// `label` is the display text on the card; `apiType` is the canonical
// contractType string sent to POST /api/contracts (from CONTRACT_TYPE — must
// match the route's resolution maps byte-for-byte). They usually coincide, but
// a card may show a shortened display label (e.g. cooperation).

export type ContractTypeId = "interested" | "exclusivity" | "cooperation" | "transfer";

const CONTRACT_TYPES: Array<{
  id:       ContractTypeId;
  label:    string;
  apiType:  string;
  subtitle: string;
  iconBg:   string;
  active:   boolean;
  icon:     React.ReactNode;
}> = [
  {
    id: "interested", label: CONTRACT_TYPE.INTERESTED, apiType: CONTRACT_TYPE.INTERESTED,
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
    // Service-order-first owner flow: RENTAL / SALE / BOTH are all live
    // (defaults to RENTAL); an optional separate exclusivity document can be
    // added via the "הוסף גם הסכם בלעדיות" checkbox.
    id: "exclusivity", label: CONTRACT_TYPE.OWNER_EXCLUSIVE, apiType: CONTRACT_TYPE.OWNER_EXCLUSIVE,
    subtitle: "הסכם בלעדיות עם בעל הנכס",
    iconBg: "bg-emerald-50 text-emerald-600", active: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <rect x="9.5" y="13" width="5" height="8" rx="0.5" /><circle cx="12" cy="16" r="1" />
      </svg>
    ),
  },
  {
    // Live — shared-pool cooperation (Broker A = the SignDeal user; Broker B =
    // the cooperating broker signs). Every dealType resolves server-side to
    // BROKER_COOP_SHARED_POOL; the flow is fee-free (fee section hidden,
    // commission forced 0). Display label is intentionally shorter than the
    // canonical apiType string.
    id: "cooperation", label: "הסכם שיתוף פעולה", apiType: CONTRACT_TYPE.BROKER_COOP,
    subtitle: "שיתוף עסקה עם מתווך שותף",
    iconBg: "bg-violet-50 text-violet-600", active: true,
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
    id: "transfer", label: CONTRACT_TYPE.TRANSFER, apiType: CONTRACT_TYPE.TRANSFER,
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

// ── Per-category form defaults ─────────────────────────────────────────────────
// Applied both when a card is clicked AND when the page preselects a category
// via the validated ?type= query param (dashboard quick cards deep-link here).
// One source of truth so both entry paths produce identical form state.
// For "interested" the values match INITIAL exactly, so a no-param visit stays
// bit-identical to the historical default.
function categoryDefaults(id: ContractTypeId): Partial<FormState> {
  const shared = {
    priceNis: "", commissionNis: "", commissionPct: "",
    commissionSaleNis: "", commissionSalePct: "", salePriceNis: "",
    rentalCommissionPreset: "one_month" as RentalCommissionPreset,
    rentalCommissionMonths: "1",
    commissionSaleMode: "percent" as CommissionMode,
    hideFullAddressFromClient: false,
    exclusivityDurationMode: "months" as const,
    exclusivityMonths: "3",
    exclusivityEndCustom: "",
    ownerMode: "serviceOnly" as const,
    counterpartyBrokerLicense: "",
    coopType: "sharedPool" as const,
    brokerCoopTransferPercent: "",
  };
  if (id === "exclusivity") {
    // Owner flow (service-order first) defaults to RENTAL; SALE and BOTH are
    // selectable in the deal-type section. Exclusivity period seeded (start =
    // today, 3 months) for when the broker opts into the exclusivity document;
    // address never hidden.
    return {
      ...shared,
      dealType: "RENTAL",
      exclusivityStart: toInputValue(new Date()),
    };
  }
  return {
    ...shared,
    dealType: "SALE",
    exclusivityStart: "",
  };
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({ contractId, signatureToken, clientName, exclusivity, onCreateAnother }: {
  contractId: string; signatureToken: string; clientName: string;
  // Owner two-document package — the secondary exclusivity document, when created
  exclusivity?: { contractId: string; signatureToken: string } | null;
  onCreateAnother: () => void;
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
        <h2 className="text-2xl font-bold text-gray-900">
          {exclusivity ? "המסמכים נוצרו בהצלחה" : "החוזה נוצר בהצלחה!"}
        </h2>
        <p className="text-gray-500 text-sm">
          {/* Package: two legal documents, one broker-facing signing package.
              The link card below points at the PRIMARY service-order contract;
              the exclusivity document travels on its own SMS/email link. */}
          {exclusivity
            ? "נשלחו לבעל הנכס שני מסמכים נפרדים לחתימה: הסכם תיווך והסכם בלעדיות"
            : <>החוזה נשלח ל<span className="font-semibold text-gray-700">{clientName}</span> ב-SMS ובמייל</>}
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

export function NewContractForm({ subscription, initialContractType = "interested" }: {
  subscription?: SubscriptionStatus;
  initialContractType?: ContractTypeId;   // validated by the page's ?type= allowlist
}) {
  // Lazy initializer: arriving via ?type=owner-exclusive produces exactly the
  // same state as clicking the owner-exclusive card (shared categoryDefaults).
  const [form,   setForm]   = useState<FormState>(() => ({ ...INITIAL, ...categoryDefaults(initialContractType) }));
  const [stage,  setStage]  = useState<Stage>({ name: "idle" });
  const [errors, setErrors] = useState<FieldError>({});
  const firstErrorRef = useRef<HTMLDivElement>(null);

  // ── Subscription gate ─────────────────────────────────────────────────────
  // Computed once; subscription data comes from the server so it never changes.
  const subscriptionBlocked = subscription != null && !subscription.allowed;

  // Build a UsageData-compatible object for UpgradeBanner when the user is blocked.
  const bannerData: UsageData | null = subscriptionBlocked && subscription
    ? {
        plan:             subscription.plan,
        planLabel:        subscription.planLabel,
        isTrialing:       subscription.isTrialing,
        isActive:         subscription.isActive,
        isExpired:        subscription.isExpired,
        trialEndsAt:      subscription.trialEndsAt,
        monthlyDocCount:  subscription.monthlyDocCount,
        monthlyDocLimit:  subscription.monthlyDocLimit,
        monthlyRemaining: subscription.monthlyRemaining,
        // backward-compat aliases (same values)
        activeCount:      subscription.monthlyDocCount,
        limit:            subscription.monthlyDocLimit,
        remaining:        subscription.monthlyRemaining,
        allowed:          subscription.allowed,
        reason:           subscription.reason,
      }
    : null;

  // Contract category selection — drives the payload's contractType string.
  // Only cards with active:true are selectable.
  const [contractTypeId, setContractTypeId] = useState<ContractTypeId>(initialContractType);
  const isOwner = contractTypeId === "exclusivity";
  const isCoop  = contractTypeId === "cooperation";
  // Fee-free flows: the standalone exclusivity document creates no owner fee
  // obligation, and the cooperation agreement divides fees after collection
  // rather than setting an amount — every fee field/validation is skipped and
  // the payload sends commission: 0 (the API additionally forces it server-side).
  const hideFeeFields = (isOwner && form.ownerMode === "exclusivityOnly") || isCoop;

  // Signing-party wording — the Client record is the buyer/renter in the
  // interested flow, the property owner in the owner flow, and the cooperating
  // broker (Broker B) in the cooperation flow. The interested and owner strings
  // are byte-identical to the historical inline ternaries.
  const party = isCoop
    ? {
        section:    "פרטי המתווך השני",
        name:       "שם המתווך",
        phone:      "טלפון המתווך",
        email:      "אימייל המתווך",
        idNumber:   "תעודת זהות המתווך",
        skipLabel:  "אין לי כרגע ת״ז / מייל — המתווך ישלים לפני החתימה",
        skipHint:   "המתווך יתבקש להשלים פרטים אלו לפני שיוכל לחתום על החוזה",
        nameError:  "שם המתווך הוא שדה חובה",
        phoneError: "טלפון המתווך הוא שדה חובה",
        emailError: "אימייל המתווך הוא שדה חובה (או סמן 'אין לי כרגע')",
      }
    : isOwner
      ? {
          section:    "פרטי בעל הנכס",
          name:       "שם בעל הנכס",
          phone:      "טלפון בעל הנכס",
          email:      "אימייל בעל הנכס",
          idNumber:   "תעודת זהות בעל הנכס",
          skipLabel:  "אין לי כרגע ת״ז / מייל — בעל הנכס ישלים לפני החתימה",
          skipHint:   "בעל הנכס יתבקש להשלים פרטים אלו לפני שיוכל לחתום על החוזה",
          nameError:  "שם בעל הנכס הוא שדה חובה",
          phoneError: "טלפון בעל הנכס הוא שדה חובה",
          emailError: "אימייל בעל הנכס הוא שדה חובה (או סמן 'אין לי כרגע')",
        }
      : {
          section:    "פרטי לקוח",
          name:       "שם לקוח",
          phone:      "טלפון לקוח",
          email:      "אימייל לקוח",
          idNumber:   "תעודת זהות לקוח",
          skipLabel:  "אין לי כרגע ת״ז / מייל — הלקוח ישלים לפני החתימה",
          skipHint:   "הלקוח יתבקש להשלים פרטים אלו לפני שיוכל לחתום על החוזה",
          nameError:  "שם לקוח הוא שדה חובה",
          phoneError: "טלפון לקוח הוא שדה חובה",
          emailError: "אימייל לקוח הוא שדה חובה (או סמן 'אין לי כרגע')",
        };

  // ── Exclusivity period derivation (owner-exclusive rental only) ────────────
  // End date uses the inclusive day-before convention (3 months from 01.08 →
  // 31.10). Only the resulting start/end dates are sent to the API.
  const exclusivityStartDate = fromInputValue(form.exclusivityStart);
  const exclusivityEndDate: Date | null = !exclusivityStartDate
    ? null
    : form.exclusivityDurationMode === "months"
      ? addMonthsInclusive(exclusivityStartDate, parseInt(form.exclusivityMonths, 10) || 1)
      : fromInputValue(form.exclusivityEndCustom);
  const exclusivityDur =
    exclusivityStartDate && exclusivityEndDate && exclusivityEndDate > exclusivityStartDate
      ? exclusivityDuration(exclusivityStartDate, exclusivityEndDate)
      : null;

  // Selecting a category applies its defaults (shared with the ?type= preselect
  // path via categoryDefaults). The owner-exclusive flow defaults to RENTAL
  // (SALE is also supported; BOTH stays disabled in the UI and blocked by the
  // API), and the address-hiding toggle is hidden + forced off.
  function handleContractTypeSelect(id: ContractTypeId) {
    if (id === contractTypeId) return;
    setContractTypeId(id);
    setForm((prev) => ({ ...prev, ...categoryDefaults(id) }));
    setErrors({});
    setStage((s) => (s.name === "error" ? { name: "idle" } : s));
  }

  // Selection tracking — UI-only; not included in API payload
  const [selectedClientId,   setSelectedClientId]   = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedPropertyId,   setSelectedPropertyId]   = useState<string | null>(null);
  const [selectedPropertyAddr, setSelectedPropertyAddr] = useState<string | null>(null);

  // Fields that, when manually edited, mean the broker is typing a new client
  // rather than using the one they picked from the picker.  Editing any of
  // these while a client is already selected MUST clear selectedClientId so
  // the POST payload does NOT send existingClientDbId for the old client.
  //
  // Without this, a broker who picks "אופיר מלכה" then types over the fields
  // to create "גפן בראון" still sends existingClientDbId pointing to "אופיר מלכה",
  // causing the contract to link to the wrong DB record and showing the wrong
  // client name / phone / idNumber in the generated document and signing page.
  const CLIENT_MANUAL_FIELDS = new Set<keyof FormState>([
    "clientName", "clientPhone", "clientEmail", "clientIdNumber",
  ]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev }; delete next[key]; return next;
    });
    setStage((s) => s.name === "error" ? { name: "idle" } : s);
    // Root-cause fix: deselect the previously-picked client the instant the
    // broker manually edits any client field.  useState setters are stable
    // references so adding them to the deps array is unnecessary.
    if (CLIENT_MANUAL_FIELDS.has(key)) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[NewContractForm] manual edit of "${key}" — clearing selectedClientId`);
      }
      setSelectedClientId(null);
      setSelectedClientName(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!form.clientName.trim())  e.clientName  = party.nameError;
    if (!form.clientPhone.trim()) e.clientPhone = party.phoneError;
    if (!form.skipEmailId) {
      if (!form.clientEmail.trim())    e.clientEmail    = party.emailError;
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
    // ── Sale price (BOTH) — always required: it is persisted as
    // propertySalePrice and displayed in the contract property table (annex),
    // in EVERY owner mode including exclusivityOnly.
    if (form.dealType === "BOTH") {
      const salePriceNis = parseNis(form.salePriceNis);
      if (isNaN(salePriceNis) || salePriceNis <= 0) e.salePriceNis = "מחיר מכירה חייב להיות מספר חיובי";
    }
    // ── Fee amounts — skipped entirely for the standalone exclusivity mode ───
    if (!hideFeeFields) {
      if (form.dealType === "SALE" && form.commissionMode === "percent") {
        const pct = parseFloat(form.commissionPct);
        if (isNaN(pct) || pct < 0 || pct > 100) e.commissionPct = "אחוז עמלה חייב להיות בין 0 ל-100";
      } else if ((form.dealType === "RENTAL" || form.dealType === "BOTH") && form.rentalCommissionPreset !== "fixed") {
        // preset auto-calculates from monthly rent — no manual input to validate
      } else {
        const commNis = parseNis(form.commissionNis);
        if (isNaN(commNis) || commNis < 0) e.commissionNis = "עמלת תיווך חייבת להיות מספר חיובי או 0";
      }
      if (form.dealType === "BOTH") {
        if (form.commissionSaleMode === "percent") {
          const pct = parseFloat(form.commissionSalePct);
          if (isNaN(pct) || pct < 0 || pct > 100) e.commissionSalePct = "אחוז עמלה למכירה חייב להיות בין 0 ל-100";
        } else {
          const commSaleNis = parseNis(form.commissionSaleNis);
          if (isNaN(commSaleNis) || commSaleNis < 0) e.commissionSaleNis = "עמלת מכירה חייבת להיות מספר חיובי או 0";
        }
      }
    }
    // ── Buyer-to-seller transfer percent — required only for that subtype ────
    // Strict format: only a plain positive decimal (digits + optional decimal
    // point) is a valid legal-document percent. parseFloat would accept
    // "1.5abc"/"2%", and even Number() accepts non-standard numeric formats —
    // Number("1e2") === 100, Number("0x10") === 16, Number("+2") === 2 — so the
    // regex rejects those first; Number() then only converts an already-clean
    // decimal string. Must match the API contract (> 0, ≤ 100, decimals).
    if (isCoop && form.coopType === "buyerToSeller") {
      const rawPercent = form.brokerCoopTransferPercent.trim();
      const isDecimalFormat = /^\d+(?:\.\d+)?$/.test(rawPercent);
      const pct = Number(rawPercent);
      if (!rawPercent) {
        e.brokerCoopTransferPercent = "יש להזין את אחוז ההעברה למתווך המוכר";
      } else if (!isDecimalFormat || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
        e.brokerCoopTransferPercent = "אחוז ההעברה חייב להיות מספר גדול מ-0 ועד 100";
      }
    }
    // ── Exclusivity period — required by both exclusivity modes ──────────────
    if (isOwner && form.ownerMode !== "serviceOnly") {
      if (!form.exclusivityStart) {
        e.exclusivityStart = "תאריך תחילת הבלעדיות הוא שדה חובה";
      }
      if (form.exclusivityDurationMode === "custom") {
        if (!form.exclusivityEndCustom) {
          e.exclusivityEnd = "תאריך סיום הבלעדיות הוא שדה חובה";
        } else if (exclusivityStartDate && exclusivityEndDate && exclusivityEndDate <= exclusivityStartDate) {
          e.exclusivityEnd = "תאריך הסיום חייב להיות מאוחר מתאריך ההתחלה";
        }
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
      // Canonical category string from the selected card — must match the API's
      // resolution maps byte-for-byte (both sides import CONTRACT_TYPE).
      contractType:              CONTRACT_TYPES.find((c) => c.id === contractTypeId)?.apiType
                                   ?? CONTRACT_TYPE.INTERESTED,
      language:                  form.language,
      dealType:                  form.dealType,
      clientName:                form.clientName.trim(),
      clientPhone:               form.clientPhone.trim(),
      clientEmail:               form.skipEmailId ? "" : form.clientEmail.trim(),
      clientIdNumber:            form.skipEmailId ? "" : form.clientIdNumber.trim(),
      propertyAddress,
      propertyCity:              form.propertyCity.trim(),
      propertyPrice:             priceAgorot,
      // Fee-free flows (standalone exclusivity / cooperation) carry no fee —
      // send 0 explicitly (the fee inputs are hidden, so the calculator would
      // yield NaN); the API also forces 0.
      commission:                hideFeeFields ? 0 : commissionAgorot,
      ...(!hideFeeFields && commissionSaleAgorot !== null ? { commissionSale: commissionSaleAgorot } : {}),
      // Owner-exclusive and cooperation never hide the address (the owner knows
      // it; Broker B must see the property facts; toggle hidden for both).
      hideFullAddressFromClient: (isOwner || isCoop) ? false : form.hideFullAddressFromClient,
      // Rental fee mode — every rental-fee flow (RENTAL + the rental half of
      // BOTH, interested and owner-exclusive alike) uses MONTHS (1-12) / FIXED;
      // the server persists these per template key. ONE_MONTH remains a legacy
      // value accepted by the API (maps to 1 month).
      ...((form.dealType === "RENTAL" || form.dealType === "BOTH") && !hideFeeFields
        ? {
            rentalCommissionMode: form.rentalCommissionPreset === "fixed" ? "FIXED" : "MONTHS",
            ...(form.rentalCommissionPreset !== "fixed"
              ? { rentalCommissionMonths: parseInt(form.rentalCommissionMonths, 10) || 1 }
              : {}),
          }
        : {}),
      // Owner document mode + exclusivity period. The period dates (plain
      // YYYY-MM-DD strings) are sent for both exclusivity modes.
      ...(isOwner ? { ownerMode: form.ownerMode } : {}),
      ...(isOwner && form.ownerMode !== "serviceOnly" && form.exclusivityStart && exclusivityEndDate
        ? {
            exclusivityStartsAt: form.exclusivityStart,
            exclusivityEndsAt:   toInputValue(exclusivityEndDate),
          }
        : {}),
      // Sale fee mode + percent — lets the API render the dynamic clause 5.1 wording
      // for the sale interested template. The server persists them only for that template.
      ...(form.dealType === "SALE" && !hideFeeFields
        ? {
            saleCommissionMode: form.commissionMode === "percent" ? "PERCENT" : "FIXED",
            ...(form.commissionMode === "percent"
              ? { saleCommissionPercent: parseFloat(form.commissionPct) }
              : {}),
          }
        : {}),
      // BOTH — sale price + sale fee mode, from the BOTH-specific state vars
      // (commissionSaleMode/commissionSalePct, NOT the SALE-side commissionMode/Pct).
      // The API requires propertySalePrice for BOTH and renders clause 5.2 from the
      // mode (sale amount from commissionSale); the rental mode (clause 5.1) is
      // sent by the shared RENTAL/BOTH spread above.
      ...(form.dealType === "BOTH"
        ? {
            // Sale price is annex data — sent in EVERY mode incl. exclusivityOnly.
            propertySalePrice: Math.round(parseNis(form.salePriceNis) * 100),
            ...(!hideFeeFields
              ? {
                  saleCommissionMode: form.commissionSaleMode === "percent" ? "PERCENT" : "FIXED",
                  ...(form.commissionSaleMode === "percent"
                    ? { saleCommissionPercent: parseFloat(form.commissionSalePct) }
                    : {}),
                }
              : {}),
          }
        : {}),
      // Cooperation subtype — resolves the template key server-side
      // (sharedPool → BROKER_COOP_SHARED_POOL, eachSide → BROKER_COOP_EACH_SIDE,
      // buyerToSeller → BROKER_COOP_BUYER_TO_SELLER). Sent only for the
      // cooperation category.
      ...(isCoop ? { coopType: form.coopType } : {}),
      // Buyer-to-seller transfer percent — strict numeric (validation already
      // guaranteed it is finite and in range); omitted entirely for every
      // other subtype/category, so a hidden preserved value can never leak.
      ...(isCoop && form.coopType === "buyerToSeller"
        ? { brokerCoopTransferPercent: Number(form.brokerCoopTransferPercent.trim()) }
        : {}),
      // Broker cooperation — Broker B's license number (optional free text).
      // Omitted when empty/whitespace; the API trims it, persists it only for
      // the cooperation keys, and renders the party-line suffix from it.
      ...(isCoop && form.counterpartyBrokerLicense.trim()
        ? { counterpartyBrokerLicenseNumber: form.counterpartyBrokerLicense.trim() }
        : {}),
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
      setStage({
        name: "success", contractId: contract.id, signatureToken: contract.signatureToken, clientName: form.clientName.trim(),
        // Owner two-document package — the API adds exclusivityContract only
        // when the secondary exclusivity document was created.
        exclusivity: contract.exclusivityContract
          ? { contractId: contract.exclusivityContract.id, signatureToken: contract.exclusivityContract.signatureToken }
          : null,
      });
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
        exclusivity={stage.exclusivity ?? null}
        onCreateAnother={() => {
          // Reset to the ENTRY category (not always "interested") — a broker who
          // arrived via the owner-exclusive dashboard card stays in that flow.
          setForm({ ...INITIAL, ...categoryDefaults(initialContractType) });
          setErrors({}); setStage({ name: "idle" });
          setContractTypeId(initialContractType);
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

      {/* Subscription upgrade banner — shown when user is blocked */}
      {bannerData && <UpgradeBanner data={bannerData} />}

      <div className="space-y-5">

        {/* ══ 1. Contract type ══════════════════════════════════════════════ */}
        <Section title="סוג חוזה">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONTRACT_TYPES.map((ct) => {
              const selected = ct.id === contractTypeId;
              return (
                <div key={ct.id}
                  {...(ct.active ? { role: "button", onClick: () => handleContractTypeSelect(ct.id) } : {})}
                  className={[
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

        {/* ══ 1a. Cooperation subtype — which cooperation agreement is created ═ */}
        {/* sharedPool: fees pooled and split equally (BROKER_COOP_SHARED_POOL).
            eachSide: each broker collects only from the client they represent
            (BROKER_COOP_EACH_SIDE). buyerToSeller: the buyer-side broker
            transfers an agreed percent of the deal price to the seller-side
            broker (BROKER_COOP_BUYER_TO_SELLER) — the only subtype with an
            extra input (the transfer percent below). All subtypes share the
            entire surrounding form (party fields, license, deal type, fee-free
            behavior) — the selector changes only the resolved template.
            Switching subtypes preserves a typed percent (payload-gated) but
            clears its validation error so it can never block other subtypes. */}
        {isCoop && (
          <Section title="סוג שיתוף פעולה">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "sharedPool",    label: "קופה משותפת"                       },
                  { id: "eachSide",      label: "כל מתווך גובה מהצד שלו"          },
                  { id: "buyerToSeller", label: "מתווך הקונה מעביר למתווך המוכר" },
                ] as const).map((o) => (
                  <button key={o.id} type="button"
                    onClick={() => {
                      set("coopType", o.id);
                      setErrors((prev) => { const n = { ...prev }; delete n.brokerCoopTransferPercent; return n; });
                    }}
                    className={[
                      "px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                      form.coopType === o.id
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                        : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                    ].join(" ")}>
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Transfer percent — required for the buyer-to-seller document
                  (its opening paragraph renders ל־X% ממחיר העסקה; the API
                  rejects creation without it). */}
              {form.coopType === "buyerToSeller" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="brokerCoopTransferPercent">אחוז ההעברה ממחיר העסקה</FieldLabel>
                    <TextInput id="brokerCoopTransferPercent" value={form.brokerCoopTransferPercent}
                      onChange={(v) => set("brokerCoopTransferPercent", v)}
                      placeholder="1.5" error={errors.brokerCoopTransferPercent} />
                    <p className="text-xs text-gray-400 mt-1">
                      האחוז שמתווך הקונה/השוכר יעביר למתווך המוכר/המשכיר ממחיר העסקה.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ══ 2. Client details ═════════════════════════════════════════════ */}
        <Section title={party.section}>
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
                <FieldLabel htmlFor="clientName">{party.name}</FieldLabel>
                <TextInput id="clientName" value={form.clientName} onChange={(v) => set("clientName", v)}
                  placeholder="ישראל ישראלי" error={errors.clientName} />
              </div>
              <div>
                <FieldLabel htmlFor="clientPhone">{party.phone}</FieldLabel>
                <TextInput id="clientPhone" value={form.clientPhone} onChange={(v) => set("clientPhone", v)}
                  placeholder="050-0000000" type="tel" error={errors.clientPhone} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="clientEmail" optional={form.skipEmailId}>{party.email}</FieldLabel>
                <TextInput id="clientEmail" value={form.clientEmail} onChange={(v) => set("clientEmail", v)}
                  placeholder="client@example.com" type="email" disabled={form.skipEmailId} error={errors.clientEmail} />
              </div>
              <div>
                <FieldLabel htmlFor="clientIdNumber" optional={form.skipEmailId}>{party.idNumber}</FieldLabel>
                <TextInput id="clientIdNumber" value={form.clientIdNumber} onChange={(v) => set("clientIdNumber", v)}
                  placeholder="000000000" disabled={form.skipEmailId} error={errors.clientIdNumber} />
              </div>
            </div>

            {/* Broker B license — cooperation only. A document-level Contract
                field: editing it must NOT clear a picked client (not part of
                CLIENT_MANUAL_FIELDS) and it stays enabled under skipEmailId
                (it isn't signer-completion data). */}
            {isCoop && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="counterpartyBrokerLicense" optional>מספר רישיון תיווך</FieldLabel>
                  <TextInput id="counterpartyBrokerLicense" value={form.counterpartyBrokerLicense}
                    onChange={(v) => set("counterpartyBrokerLicense", v)}
                    placeholder="12345" />
                </div>
              </div>
            )}

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
                <p className="text-sm font-medium text-gray-700">
                  {party.skipLabel}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {party.skipHint}
                </p>
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
                  rentalCommissionMonths: "1",
                  // Interested rental template discloses the full address only after
                  // signing — default to hidden (broker can uncheck). The owner and
                  // cooperation flows never hide (the owner knows their own address;
                  // Broker B must see the property facts).
                  hideFullAddressFromClient: (isOwner || isCoop) ? false : true,
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
                  rentalCommissionMonths: "1",
                  hideFullAddressFromClient: false,
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
                  rentalCommissionMonths: "1",
                  commissionSaleMode: "percent",
                  hideFullAddressFromClient: false,
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

        {/* ══ 4a. Owner document mode — which document(s) this signing creates ═ */}
        {/* serviceOnly: one service-order (fee) document. serviceWithExclusivity:
            service-order + linked general exclusivity document (one package, one
            usage unit). exclusivityOnly: one standalone OWNER_EXCLUSIVE_ONLY
            document with no owner fee obligation — the fee section is hidden and
            the API forces commission = 0. */}
        {isOwner && (
          <Section title="מסמכי החתמה" subtitle="בחר אילו מסמכים ייווצרו ויישלחו לבעל הנכס">
            <div className="flex flex-wrap gap-2">
              {([
                { id: "serviceOnly",            label: "הסכם תיווך בלבד"            },
                { id: "serviceWithExclusivity", label: "הסכם תיווך + הסכם בלעדיות" },
                { id: "exclusivityOnly",        label: "הסכם בלעדיות בלבד"          },
              ] as const).map((m) => (
                <button key={m.id} type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, ownerMode: m.id }));
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n.exclusivityStart; delete n.exclusivityEnd;
                      delete n.commissionNis; delete n.commissionPct;
                      delete n.commissionSaleNis; delete n.commissionSalePct;
                      return n;
                    });
                  }}
                  className={[
                    "px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                    form.ownerMode === m.id
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                  ].join(" ")}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ══ 4b. Exclusivity period — both exclusivity modes ═ */}
        {/* Only the computed start/end dates are sent to the API; duration mode
            and text are UI-derived. End dates use the inclusive day-before
            convention (3 months from 01.08 → 31.10). */}
        {isOwner && form.ownerMode !== "serviceOnly" && (
          <Section title="הסכם בלעדיות" subtitle="תקופת הבלעדיות של מסמך הבלעדיות">
            <div className="space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="exclusivityStart">תאריך התחלה</FieldLabel>
                  <TextInput id="exclusivityStart" type="date" value={form.exclusivityStart}
                    onChange={(v) => set("exclusivityStart", v)} error={errors.exclusivityStart} />
                </div>
              </div>

              {/* Duration: quick month chips + custom end date */}
              <div>
                <FieldLabel>משך הבלעדיות</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {["1", "3", "6", "12"].map((m) => {
                    const active = form.exclusivityDurationMode === "months" && form.exclusivityMonths === m;
                    return (
                      <button key={m} type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, exclusivityDurationMode: "months", exclusivityMonths: m }));
                          setErrors((prev) => { const n = { ...prev }; delete n.exclusivityEnd; return n; });
                        }}
                        className={[
                          "px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                            : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                        ].join(" ")}>
                        {m === "1" ? "חודש אחד" : `${m} חודשים`}
                      </button>
                    );
                  })}
                  <button type="button"
                    onClick={() => setForm((prev) => ({ ...prev, exclusivityDurationMode: "custom" }))}
                    className={[
                      "px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                      form.exclusivityDurationMode === "custom"
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300"
                        : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200",
                    ].join(" ")}>
                    תאריך מותאם אישית
                  </button>
                </div>
              </div>

              {form.exclusivityDurationMode === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="exclusivityEndCustom">תאריך סיום</FieldLabel>
                    <TextInput id="exclusivityEndCustom" type="date" value={form.exclusivityEndCustom}
                      onChange={(v) => set("exclusivityEndCustom", v)} error={errors.exclusivityEnd} />
                  </div>
                </div>
              )}

              {/* Computed period summary + non-blocking whole-months warning */}
              {exclusivityStartDate && exclusivityEndDate && exclusivityEndDate > exclusivityStartDate && (
                <p className="text-xs text-gray-500">
                  תקופת הבלעדיות תסתיים ב-{toInputValue(exclusivityEndDate).split("-").reverse().join(".")}
                </p>
              )}
              {form.exclusivityDurationMode === "custom" && exclusivityDur && !isWholeMonths(exclusivityDur) && (
                <p className="text-xs text-amber-600">
                  שים לב: תקופת הבלעדיות שנבחרה היא {durationTextHe(exclusivityDur)}.
                </p>
              )}

              {/* Two-documents notice — package mode only */}
              {form.ownerMode === "serviceWithExclusivity" && (
                <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-sm text-amber-700 font-medium">
                    יישלחו לבעל הנכס שני מסמכים נפרדים: הסכם תיווך והסכם בלעדיות
                  </span>
                </div>
              )}

            </div>
          </Section>
        )}

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

            {/* Hide-address toggle — hidden for owner-exclusive (the owner knows
                their own address) and cooperation (Broker B must see the property
                facts); the payload forces the flag to false for both. */}
            {!isOwner && !isCoop && (
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
            )}

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
        {/* Fee section — hidden entirely for the standalone exclusivity mode
            (the document carries no owner fee; the API forces commission = 0) */}
        {!hideFeeFields && (
        <Section title="עמלת תיווך">
          <div className="space-y-6">

            {/* ── RENTAL presets (shared between RENTAL and the rental half of BOTH) */}
            {(form.dealType === "RENTAL" || form.dealType === "BOTH") && (() => {
              // Every rental-fee flow (interested rental, the rental half of BOTH
              // and owner-exclusive rental): the months option opens a 1-12
              // selector below.
              const presets: { id: RentalCommissionPreset; label: string; sub?: string }[] = [
                { id: "one_month", label: "לפי חודשי שכירות"          },
                { id: "fixed",     label: "סכום ידני (₪)"              },
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
                  {/* Number of monthly rents (1-12) — all months-based rental flows */}
                  {form.rentalCommissionPreset !== "fixed" && (
                    <div className="mb-3">
                      <select
                        value={form.rentalCommissionMonths}
                        onChange={(e) => set("rentalCommissionMonths", e.target.value)}
                        className="w-full sm:w-56 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-base sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {n === 1 ? "חודש אחד" : `${n} חודשים`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
                  {/* The rental template's clause 6.1 always appends "+מע״מ" to the fee */}
                  {form.dealType === "RENTAL" && (
                    <p className="text-xs text-gray-400 mt-2">
                      שים לב: דמי התיווך בחוזה יוצגו בתוספת מע&quot;מ כדין.
                    </p>
                  )}
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
                {/* The sale template's clause 5.1 always appends "+מע״מ" to the fee */}
                <p className="text-xs text-gray-400 mt-2">
                  שים לב: דמי התיווך בחוזה יוצגו בתוספת מע&quot;מ כדין.
                </p>
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

            {/* One general VAT note for BOTH — covers both fee blocks above
                (clauses 5.1/5.2 of the BOTH template always append "+מע״מ") */}
            {form.dealType === "BOTH" && (
              <p className="text-xs text-gray-400">
                שים לב: דמי התיווך בחוזה יוצגו בתוספת מע&quot;מ כדין.
              </p>
            )}

          </div>
        </Section>
        )}

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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || subscriptionBlocked}
            title={subscriptionBlocked ? "שדרג את המנוי כדי ליצור חוזים חדשים" : undefined}
            className={[
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all",
              submitting || subscriptionBlocked
                ? "bg-indigo-400 cursor-not-allowed opacity-60"
                : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200",
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
