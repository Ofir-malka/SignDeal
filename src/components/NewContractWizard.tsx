"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { getLabels, isRtlLang } from "@/lib/contracts/labels";
import {
  type ApiPropertyResponse,
  type Property,
  apiToProperty,
  PROPERTY_TYPE_LABELS,
  PROPERTY_LISTING_TYPE_LABELS,
} from "@/lib/api-properties";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractType    = "interested" | "exclusivity" | "cooperation" | "";
type DealType        = "rental" | "sale" | "";
type CommType        = "fixed" | "percentage" | "";
type SendMethod      = "whatsapp" | "sms" | "";
type PropertyMode    = "select" | "manual" | "create";
type ClientMode      = "new" | "select";
type ContractLang    = "HE" | "EN" | "FR" | "RU";

// ─── ApiClient (local — no separate lib needed) ───────────────────────────────
type ApiClient = {
  id:        string;
  name:      string;
  phone:     string;
  email:     string;
  idNumber:  string;
  createdAt: string;
};

interface FormData {
  contractType:         ContractType;
  language:             ContractLang;
  clientName:           string;
  clientPhone:          string;
  clientEmail:          string;
  clientId:             string;
  clientMissingInfo:    boolean;
  clientMode:           ClientMode;
  existingClientDbId:   string;      // DB primary key of selected existing client
  propertyId:           string;
  propertyMode:         PropertyMode;
  propertyAddress:      string;
  propertyCity:         string;
  dealType:             DealType;
  rentalPrice:          string;
  salePrice:            string;
  commissionType:       CommType;
  commissionAmount:     string;
  commissionPercentage: string;
  sendMethod:                SendMethod;
  hideFullAddressFromClient: boolean;
}

const INITIAL: FormData = {
  contractType: "", language: "HE", clientName: "", clientPhone: "", clientEmail: "",
  clientId: "", clientMissingInfo: false, clientMode: "new", existingClientDbId: "",
  propertyId: "", propertyMode: "select",
  propertyAddress: "", propertyCity: "", dealType: "", rentalPrice: "", salePrice: "",
  commissionType: "", commissionAmount: "", commissionPercentage: "", sendMethod: "",
  hideFullAddressFromClient: false,
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "סוג חוזה" },
  { n: 2, label: "פרטי לקוח" },
  { n: 3, label: "פרטי נכס" },
  { n: 4, label: "עמלה" },
  { n: 5, label: "סיכום" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-center mb-8">
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                step.n < current
                  ? "bg-indigo-600 text-white"
                  : step.n === current
                  ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step.n < current ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                step.n
              )}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block whitespace-nowrap ${
                step.n <= current ? "text-gray-700" : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-10 sm:w-14 h-0.5 mx-1 mb-5 transition-all ${
                step.n < current ? "bg-indigo-600" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Shared input ─────────────────────────────────────────────────────────────

function Field({
  label, placeholder, value, onChange, type = "text",
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

// ─── Language selector ────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS: { id: ContractLang; label: string; flag: string }[] = [
  { id: "HE", label: "עברית",    flag: "🇮🇱" },
  { id: "EN", label: "English",  flag: "🇬🇧" },
  { id: "FR", label: "Français", flag: "🇫🇷" },
  { id: "RU", label: "Русский",  flag: "🇷🇺" },
];

// ─── Step 1: סוג חוזה ─────────────────────────────────────────────────────────

const CONTRACT_OPTIONS = [
  {
    id: "interested" as const,
    title: "החתמת מתעניין",
    desc: "חוזה עם רוכש או שוכר פוטנציאלי המתעניין בנכס",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "exclusivity" as const,
    title: "החתמת בעל נכס / בלעדיות",
    desc: "הסכם בלעדיות עם בעל הנכס לשיווק ומכירה",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: "cooperation" as const,
    title: "הסכם שיתוף פעולה בין מתווכים",
    desc: "הסכם חלוקת עמלה עם מתווך נוסף בעסקה",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

function Step1({ data, set }: { data: FormData; set: (d: Partial<FormData>) => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">בחר סוג חוזה</h2>
        <p className="text-sm text-gray-500 mt-1">בחר את סוג החוזה שתרצה לשלוח ללקוח</p>
      </div>
      <div className="space-y-3">
        {CONTRACT_OPTIONS.map((opt) => {
          const active = data.contractType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => set({ contractType: opt.id })}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className={`shrink-0 ${active ? "text-indigo-600" : "text-gray-400"}`}>
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${active ? "text-indigo-900" : "text-gray-900"}`}>
                  {opt.title}
                </p>
                <p className={`text-xs mt-0.5 ${active ? "text-indigo-600" : "text-gray-500"}`}>
                  {opt.desc}
                </p>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  active ? "border-indigo-600 bg-indigo-600" : "border-gray-300"
                }`}
              >
                {active && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Language selector ── */}
      <div className="mt-6">
        <p className="text-sm font-medium text-gray-700 mb-2.5">שפת החוזה</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => {
            const active = data.language === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => set({ language: lang.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: פרטי לקוח ───────────────────────────────────────────────────────

function Step2({ data, set }: { data: FormData; set: (d: Partial<FormData>) => void }) {
  const [clients, setClients]             = useState<ApiClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [fetched, setFetched]             = useState(false);

  const selectedClient = clients.find((c) => c.id === data.existingClientDbId) ?? null;

  function loadClients() {
    setLoadingClients(true);
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d: ApiClient[]) => { setClients(d); setFetched(true); })
      .catch(() => setFetched(true))
      .finally(() => setLoadingClients(false));
  }

  // Auto-fetch on mount if returning to this step in "select" mode
  useEffect(() => {
    if (data.clientMode === "select" && !fetched) loadClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(mode: ClientMode) {
    set({ clientMode: mode, existingClientDbId: "" });
    if (mode === "select" && !fetched) loadClients();
  }

  function pickClient(c: ApiClient) {
    set({
      existingClientDbId: c.id,
      clientName:         c.name,
      clientPhone:        c.phone,
      clientEmail:        c.email,
      clientId:           c.idNumber,
      clientMissingInfo:  false,
    });
  }

  function clearClient() {
    set({
      existingClientDbId: "",
      clientName: "", clientPhone: "", clientEmail: "", clientId: "",
    });
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">פרטי לקוח</h2>
        <p className="text-sm text-gray-500 mt-1">בחר לקוח קיים או הכנס פרטי לקוח חדש</p>
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5 text-xs font-medium">
        {(
          [
            ["new",    "לקוח חדש"],
            ["select", "בחר לקוח קיים"],
          ] as [ClientMode, string][]
        ).map(([mode, label], i) => (
          <button
            key={mode}
            type="button"
            onClick={() => switchMode(mode)}
            className={`flex-1 py-2.5 transition-all ${i > 0 ? "border-s border-gray-200" : ""} ${
              data.clientMode === mode
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Mode: select ── */}
      {data.clientMode === "select" && (
        <div className="mb-5">
          {loadingClients ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded-xl px-5 py-8 text-center">
              <p className="text-sm text-gray-500 mb-3">אין לקוחות שמורים עדיין</p>
              <button
                type="button"
                onClick={() => switchMode("new")}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                הכנס לקוח חדש
              </button>
            </div>
          ) : selectedClient ? (
            <div className="border-2 border-indigo-500 bg-indigo-50 rounded-xl px-4 py-3.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-indigo-900">{selectedClient.name}</p>
                <p className="text-xs text-indigo-600 mt-0.5">{selectedClient.phone}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedClient.email && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-xs text-indigo-700 truncate max-w-[160px]">
                      {selectedClient.email}
                    </span>
                  )}
                  {selectedClient.idNumber && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-xs text-indigo-700">
                      ת״ז {selectedClient.idNumber}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={clearClient}
                className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
              >
                שנה
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickClient(c)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-right hover:bg-indigo-50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-900">
                      {c.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {c.phone}
                      {c.email && ` · ${c.email}`}
                    </p>
                  </div>
                  {c.idNumber && (
                    <span className="shrink-0 text-xs text-gray-400">ת״ז {c.idNumber}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mode: new (unchanged from before) ── */}
      {data.clientMode === "new" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="שם מלא" placeholder="ישראל ישראלי" value={data.clientName} onChange={(v) => set({ clientName: v })} />
            <Field label="טלפון" placeholder="050-0000000" value={data.clientPhone} onChange={(v) => set({ clientPhone: v })} type="tel" />
            <Field
              label={data.clientMissingInfo ? "אימייל (אופציונלי)" : "אימייל"}
              placeholder="name@example.com"
              value={data.clientEmail}
              onChange={(v) => set({ clientEmail: v })}
              type="email"
            />
            <Field
              label={data.clientMissingInfo ? "תעודת זהות (אופציונלי)" : "תעודת זהות"}
              placeholder="000000000"
              value={data.clientId}
              onChange={(v) => set({ clientId: v })}
            />
          </div>

          <label className="flex items-start gap-3 mt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={data.clientMissingInfo}
              onChange={(e) => set({ clientMissingInfo: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-600 leading-snug">
              אין לי כרגע ת״ז / מייל — הלקוח ישלים לפני החתימה
            </span>
          </label>

          {data.clientMissingInfo && (
            <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
              <svg className="shrink-0 text-amber-500 mt-0.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-xs text-amber-700 leading-relaxed">
                החוזה ייווצר ללא ת״ז ומייל. הלקוח יתבקש להשלים את הפרטים לפני החתימה הדיגיטלית.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: פרטי נכס ────────────────────────────────────────────────────────

const PROPERTY_TYPE_BADGE: Record<string, string> = {
  APARTMENT: "bg-blue-50 text-blue-700",
  HOUSE:     "bg-emerald-50 text-emerald-700",
  OFFICE:    "bg-purple-50 text-purple-700",
  LAND:      "bg-amber-50 text-amber-700",
  PARKING:   "bg-gray-100 text-gray-600",
  OTHER:     "bg-gray-100 text-gray-600",
};

function Step3({ data, set }: { data: FormData; set: (d: Partial<FormData>) => void }) {
  const [properties, setProperties]     = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);

  // Inline create form state
  const [createForm, setCreateForm] = useState({
    address: "", city: "", type: "APARTMENT", listingType: "RENTAL", rooms: "", floor: "",
  });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((raw: ApiPropertyResponse[]) => setProperties(raw.map(apiToProperty)))
      .catch(() => {})
      .finally(() => setLoadingProps(false));
  }, []);

  const selectedProp = properties.find((p) => p.id === data.propertyId) ?? null;

  function pickProperty(p: Property) {
    const priceStr = p.askingPriceRaw != null
      ? String(Math.round(p.askingPriceRaw / 100))
      : "";
    set({
      propertyId:      p.id,
      propertyAddress: p.address,
      propertyCity:    p.city,
      ...(priceStr && { rentalPrice: priceStr, salePrice: priceStr }),
      ...(p.listingTypeKey === "RENTAL" && { dealType: "rental" as DealType }),
      ...(p.listingTypeKey === "SALE"   && { dealType: "sale"   as DealType }),
      // BOTH → leave dealType unchanged so broker picks manually
    });
  }

  function clearProperty() {
    set({ propertyId: "", propertyAddress: "", propertyCity: "" });
  }

  function switchMode(mode: PropertyMode) {
    set({ propertyMode: mode });
    if (mode !== "select") clearProperty();
  }

  const setCreate = (patch: Partial<typeof createForm>) =>
    setCreateForm((prev) => ({ ...prev, ...patch }));

  const canCreate = !!(createForm.address.trim() && createForm.city.trim());

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address:     createForm.address.trim(),
          city:        createForm.city.trim(),
          type:        createForm.type,
          listingType: createForm.listingType,
          rooms:       createForm.rooms ? Number(createForm.rooms) : null,
          floor:       createForm.floor ? Number(createForm.floor) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "שגיאה ביצירת נכס");
      }
      const raw: ApiPropertyResponse = await res.json();
      const newProp = apiToProperty(raw);
      setProperties((prev) => [newProp, ...prev]);
      set({ propertyMode: "select" });
      pickProperty(newProp);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "שגיאה ביצירת נכס");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">פרטי נכס</h2>
        <p className="text-sm text-gray-500 mt-1">בחר נכס קיים, הכנס ידנית, או צור נכס חדש</p>
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5 text-xs font-medium">
        {(
          [
            ["select", "בחר מנכסים שלי"],
            ["manual", "הכנס ידנית"],
            ["create", "צור נכס חדש"],
          ] as [PropertyMode, string][]
        ).map(([mode, label], i) => (
          <button
            key={mode}
            type="button"
            onClick={() => switchMode(mode)}
            className={`flex-1 py-2.5 transition-all ${i > 0 ? "border-s border-gray-200" : ""} ${
              data.propertyMode === mode
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Mode: select ── */}
      {data.propertyMode === "select" && (
        <div className="mb-5">
          {loadingProps ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div key={n} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : properties.length === 0 ? (
            <div className="border border-dashed border-gray-200 rounded-xl px-5 py-8 text-center">
              <p className="text-sm text-gray-500 mb-4">אין נכסים שמורים עדיין</p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => switchMode("manual")}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
                >
                  הכנס ידנית
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("create")}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-all"
                >
                  צור נכס חדש
                </button>
              </div>
            </div>
          ) : selectedProp ? (
            <div className="border-2 border-indigo-500 bg-indigo-50 rounded-xl px-4 py-3.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-900">{selectedProp.address}</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  {selectedProp.city} · {selectedProp.typeLabel} · {selectedProp.listingTypeLabel}
                </p>
                {(selectedProp.rooms != null || selectedProp.floor != null) && (
                  <p className="text-xs text-indigo-500 mt-0.5">
                    {[
                      selectedProp.rooms != null && `${selectedProp.rooms} חד׳`,
                      selectedProp.floor != null && `קומה ${selectedProp.floor}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearProperty}
                className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
              >
                שנה
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {properties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProperty(p)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-right hover:bg-indigo-50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-900">
                      {p.address}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.city}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        PROPERTY_TYPE_BADGE[p.typeKey] ?? PROPERTY_TYPE_BADGE.OTHER
                      }`}
                    >
                      {p.typeLabel}
                    </span>
                    <span className="text-xs text-gray-500">{p.listingTypeLabel}</span>
                    {(p.rooms != null || p.floor != null) && (
                      <span className="text-xs text-gray-400">
                        {[
                          p.rooms != null && `${p.rooms} חד׳`,
                          p.floor != null && `ק׳ ${p.floor}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mode: manual ── */}
      {data.propertyMode === "manual" && (
        <div className="space-y-4 mb-5">
          <Field
            label="כתובת נכס"
            placeholder="רחוב הרצל 12, דירה 3"
            value={data.propertyAddress}
            onChange={(v) => set({ propertyAddress: v })}
          />
          <Field
            label="עיר"
            placeholder="תל אביב"
            value={data.propertyCity}
            onChange={(v) => set({ propertyCity: v })}
          />
        </div>
      )}

      {/* ── Mode: create ── */}
      {data.propertyMode === "create" && (
        <div className="border border-gray-200 rounded-xl p-4 mb-5 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">פרטי הנכס החדש</p>
          <Field
            label="כתובת"
            placeholder="רחוב הרצל 12, דירה 3"
            value={createForm.address}
            onChange={(v) => setCreate({ address: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="עיר"
              placeholder="תל אביב"
              value={createForm.city}
              onChange={(v) => setCreate({ city: v })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">סוג נכס</label>
              <select
                value={createForm.type}
                onChange={(e) => setCreate({ type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                {Object.entries(PROPERTY_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ייעוד</label>
            <select
              value={createForm.listingType}
              onChange={(e) => setCreate({ listingType: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            >
              {Object.entries(PROPERTY_LISTING_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="חדרים (אופציונלי)"
              placeholder="3.5"
              value={createForm.rooms}
              onChange={(v) => setCreate({ rooms: v })}
              type="number"
            />
            <Field
              label="קומה (אופציונלי)"
              placeholder="4"
              value={createForm.floor}
              onChange={(v) => setCreate({ floor: v })}
              type="number"
            />
          </div>
          {createError && (
            <p className="text-xs text-red-600 mt-1">{createError}</p>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "שומר..." : "שמור וקשר לחוזה"}
          </button>
        </div>
      )}

      {/* ── Deal type + price — always shown below ── */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">סוג עסקה</label>
          <div className="flex gap-3">
            {([["rental", "השכרה"], ["sale", "מכירה"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set({ dealType: id })}
                className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  data.dealType === id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {data.dealType === "rental" && (
          <Field
            label="מחיר שכירות חודשית (₪)"
            placeholder="5,000"
            value={data.rentalPrice}
            onChange={(v) => set({ rentalPrice: v })}
          />
        )}
        {data.dealType === "sale" && (
          <Field
            label="מחיר מכירה (₪)"
            placeholder="2,500,000"
            value={data.salePrice}
            onChange={(v) => set({ salePrice: v })}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 4: עמלה ────────────────────────────────────────────────────────────

const COMM_OPTIONS = [
  {
    id: "fixed" as const,
    title: "סכום קבוע",
    desc: "עמלה בסכום שקלי קבוע",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    id: "percentage" as const,
    title: "אחוז מהעסקה",
    desc: "עמלה כאחוז ממחיר הנכס",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </svg>
    ),
  },
];

function Step4({ data, set }: { data: FormData; set: (d: Partial<FormData>) => void }) {
  const isRental = data.dealType === "rental";

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">עמלת תיווך</h2>
        <p className="text-sm text-gray-500 mt-1">הגדר את העמלה עבור העסקה</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {COMM_OPTIONS.map((opt) => {
          const active = data.commissionType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => set({ commissionType: opt.id })}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-right transition-all ${
                active
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className={`shrink-0 mt-0.5 ${active ? "text-indigo-600" : "text-gray-400"}`}>
                {opt.icon}
              </div>
              <div>
                <p className={`text-sm font-semibold ${active ? "text-indigo-900" : "text-gray-900"}`}>{opt.title}</p>
                <p className={`text-xs mt-0.5 ${active ? "text-indigo-600" : "text-gray-500"}`}>{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {data.commissionType === "fixed" && (
        <div className="space-y-2">
          <Field
            label="סכום עמלה (₪)"
            placeholder="5,000"
            value={data.commissionAmount}
            onChange={(v) => set({ commissionAmount: v })}
          />
          {isRental && (
            <button
              type="button"
              onClick={() => set({ commissionAmount: data.rentalPrice })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-all"
            >
              הגדר לפי חודש שכירות
            </button>
          )}
        </div>
      )}

      {data.commissionType === "percentage" && (
        <Field
          label="אחוז עמלה (%)"
          placeholder="2"
          value={data.commissionPercentage}
          onChange={(v) => set({ commissionPercentage: v })}
        />
      )}

      {data.commissionType && (
        <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="shrink-0 text-amber-500 mt-0.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs text-amber-700 leading-relaxed">
            {isRental
              ? 'נוהג מקובל בשכירות: עמלת התיווך שווה לשכר דירה חודשי אחד בתוספת מע"מ.'
              : "בעסקאות מכירה נהוג להגדיר עמלה לפי אחוז ממחיר העסקה, בהתאם להסכם מול הלקוח."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Contract preview document ────────────────────────────────────────────────

function ContractPreview({ data }: { data: FormData }) {
  const L               = getLabels(data.language);
  const isRtl           = isRtlLang(data.language);
  const dir             = isRtl ? "rtl" : "ltr";

  const contractTypeLabel = CONTRACT_LABELS[data.contractType] ?? "—";
  const dealTypeLabel     = data.dealType === "rental" ? "השכרה" : data.dealType === "sale" ? "מכירה" : "—";
  const price             = data.dealType === "rental" ? `₪${data.rentalPrice} / חודש`
                          : data.dealType === "sale"   ? `₪${data.salePrice}` : "—";
  const commission        = data.commissionType === "fixed"      ? `₪${data.commissionAmount}`
                          : data.commissionType === "percentage" ? `${data.commissionPercentage}%`
                          : "—";
  const today             = new Date().toLocaleDateString("he-IL");
  const fullAddress       = [data.propertyAddress, data.propertyCity].filter(Boolean).join(", ") || "—";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden" dir={dir}>
      {/* Document header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-8 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 tracking-tight">SignDeal</span>
          </div>
          <div className={isRtl ? "text-right" : "text-left"}>
            <p className="text-xs text-gray-400">{L.issueDate}</p>
            <p className="text-sm font-medium text-gray-700">{today}</p>
          </div>
        </div>
        <div className="mt-5 text-center">
          <h2 className="text-lg font-bold text-gray-900">{contractTypeLabel}</h2>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{L.brokerageAgreement}</p>
        </div>
      </div>

      {/* Document body */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-6 text-sm leading-relaxed">

        {/* Parties */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-100 mb-3">
            {L.parties}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.fullName}</p>
              <p className="font-medium text-gray-900">{data.clientName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.idNumber}</p>
              <p className="font-medium text-gray-900">{data.clientId || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.phone}</p>
              <p className="font-medium text-gray-900">{data.clientPhone || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.email}</p>
              <p className="font-medium text-gray-900">{data.clientEmail || "—"}</p>
            </div>
          </div>
        </section>

        {/* Property */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-100 mb-3">
            {L.propertyDetails}
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">{L.address}</p>
              <p className="font-medium text-gray-900">{fullAddress}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.dealType}</p>
              <p className="font-medium text-gray-900">{dealTypeLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{L.price}</p>
              <p className="font-medium text-gray-900">{price}</p>
            </div>
          </div>
        </section>

        {/* Commission */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-100 mb-3">
            {L.commissionTerms}
          </h3>
          <p className="text-gray-700">
            {L.commissionSentence(commission)}
          </p>
        </section>

        {/* Terms */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-100 mb-3">
            {L.terms}
          </h3>
          <ol className="space-y-2 text-gray-600 list-decimal list-inside">
            {L.previewTermsList.map((term, i) => <li key={i}>{term}</li>)}
          </ol>
        </section>

        {/* Signature line */}
        <section className="pt-4 border-t border-gray-200">
          <div className="max-w-xs">
            <p className="text-xs text-gray-400 mb-8">{L.clientSignature}</p>
            <div className="border-b-2 border-dashed border-gray-300 mb-1.5" />
            <p className="text-xs text-gray-500">{data.clientName || "—"}</p>
          </div>
        </section>

        <p className="text-xs text-gray-400 text-center">{L.previewNote}</p>
      </div>
    </div>
  );
}

// ─── Step 5: סיכום ושליחה ────────────────────────────────────────────────────

const CONTRACT_LABELS: Record<string, string> = {
  interested:  "החתמת מתעניין",
  exclusivity: "החתמת בעל נכס / בלעדיות",
  cooperation: "הסכם שיתוף פעולה בין מתווכים",
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0 gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-left">{value || "—"}</span>
    </div>
  );
}

const SEND_OPTIONS = [
  {
    id: "whatsapp" as const,
    label: "WhatsApp",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    id: "sms" as const,
    label: "SMS",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
];

function Step5({ data, set }: { data: FormData; set: (d: Partial<FormData>) => void }) {
  const price =
    data.dealType === "rental" ? `₪${data.rentalPrice} / חודש`
    : data.dealType === "sale"  ? `₪${data.salePrice}`
    : "—";

  const commission =
    data.commissionType === "fixed"      ? `₪${data.commissionAmount}`
    : data.commissionType === "percentage" ? `${data.commissionPercentage}%`
    : "—";

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">סיכום ושליחה</h2>
        <p className="text-sm text-gray-500 mt-1">בדוק את פרטי החוזה לפני השליחה</p>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">פרטי החוזה</p>
        <SummaryRow label="סוג חוזה"   value={CONTRACT_LABELS[data.contractType] ?? "—"} />
        <SummaryRow label="שם לקוח"    value={data.clientName} />
        <SummaryRow label="טלפון"      value={data.clientPhone} />
        <SummaryRow label="אימייל"     value={data.clientEmail || (data.clientMissingInfo ? "ישולים על ידי הלקוח" : "—")} />
        <SummaryRow label="תעודת זהות" value={data.clientId || (data.clientMissingInfo ? "ישולים על ידי הלקוח" : "—")} />
        <SummaryRow label="כתובת"      value={[data.propertyAddress, data.propertyCity].filter(Boolean).join(", ")} />
        <SummaryRow label="סוג עסקה"   value={data.dealType === "rental" ? "השכרה" : data.dealType === "sale" ? "מכירה" : "—"} />
        <SummaryRow label="מחיר"       value={price} />
        <SummaryRow label="עמלה"       value={commission} />
      </div>

      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          תצוגה מקדימה של החוזה
        </p>
        <ContractPreview data={data} />
      </div>

      {/* Privacy toggle */}
      <div className="mb-6">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.hideFullAddressFromClient}
            onChange={e => set({ hideFullAddressFromClient: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">הסתר כתובת מלאה מהלקוח</p>
            <p className="text-xs text-gray-400 mt-0.5">
              הכתובת המלאה לא תופיע בעמוד החתימה ובהודעות ללקוח
            </p>
          </div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">שיטת שליחה</label>
        <div className="grid grid-cols-2 gap-3">
          {SEND_OPTIONS.map((opt) => {
            const active = data.sendMethod === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => set({ sendMethod: opt.id })}
                className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className={active ? "text-indigo-600" : "text-gray-400"}>{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  clientName,
  sendMethod,
  createdId,
  signatureToken,
}: {
  clientName:     string;
  sendMethod:     SendMethod;
  createdId:      string;
  signatureToken: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signingUrl = `${window.location.origin}/contracts/sign/${signatureToken}`;

  function handleCopy() {
    navigator.clipboard.writeText(signingUrl);
    if (copiedRef.current) clearTimeout(copiedRef.current);
    setCopied(true);
    copiedRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8 sm:py-16">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 max-w-md w-full">
        {/* Check icon + title */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">החוזה נשלח בהצלחה!</h2>
          <p className="text-sm text-gray-500 mt-1">
            החוזה נשלח ל{clientName || "הלקוח"} דרך {sendMethod === "whatsapp" ? "WhatsApp" : "SMS"}.
          </p>
        </div>

        {/* Info rows */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6 divide-y divide-gray-100">
          <div className="flex justify-between items-center py-2.5">
            <span className="text-sm text-gray-500">לקוח</span>
            <span className="text-sm font-medium text-gray-900">{clientName || "—"}</span>
          </div>
          <div className="flex justify-between items-center py-2.5">
            <span className="text-sm text-gray-500">שיטת שליחה</span>
            <span className="text-sm font-medium text-gray-900">
              {sendMethod === "whatsapp" ? "WhatsApp" : "SMS"}
            </span>
          </div>
          <div className="flex justify-between items-start py-2.5 gap-4">
            <span className="text-sm text-gray-500 shrink-0">קישור חתימה</span>
            <span className="text-xs text-indigo-600 font-mono truncate text-left" dir="ltr">
              /contracts/sign/{signatureToken}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? "הועתק!" : "העתק קישור חתימה"}
          </button>

          <Link
            href={`/contracts/${createdId}`}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            צפה בחוזה
          </Link>

          <Link
            href="/contracts"
            className="w-full inline-flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors py-1"
          >
            חזור לחוזים
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function NewContractWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL);
  const [sent, setSent] = useState(false);
  const [createdId, setCreatedId]                         = useState<string | null>(null);
  const [createdSignatureToken, setCreatedSignatureToken] = useState<string>("");
  const [submitting, setSubmitting]                       = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (partial: Partial<FormData>) =>
    setData((prev) => ({ ...prev, ...partial }));

  const canAdvance =
    step === 1 ? !!data.contractType :
    step === 2 ? (
      data.clientMode === "select"
        ? !!data.existingClientDbId
        : !!(data.clientName && data.clientPhone && (data.clientMissingInfo || data.clientId))
    ) :
    step === 3 ? !!(data.propertyAddress && data.propertyCity && data.dealType && (data.dealType === "rental" ? data.rentalPrice : data.salePrice)) :
    step === 4 ? !!(data.commissionType && (data.commissionType === "fixed" ? data.commissionAmount : data.commissionPercentage)) :
    step === 5 ? !!data.sendMethod :
    false;

  if (sent && createdId !== null) {
    return <SuccessScreen clientName={data.clientName} sendMethod={data.sendMethod} createdId={createdId} signatureToken={createdSignatureToken} />;
  }
async function handleSendContract() {
  setSubmitting(true);
  setSubmitError(null);

  const priceStr    = data.dealType === "rental" ? data.rentalPrice : data.salePrice;
  const priceAgorot = Math.round(parseFloat(priceStr.replace(/,/g, "")) * 100);
  const commAgorot  = data.commissionType === "fixed"
    ? Math.round(parseFloat(data.commissionAmount.replace(/,/g, "")) * 100)
    : Math.round((parseFloat(data.commissionPercentage) / 100) * parseFloat(priceStr.replace(/,/g, "")) * 100);

  try {
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractType:    CONTRACT_LABELS[data.contractType],
        language:        data.language,
        dealType:        data.dealType === "rental" ? "RENTAL" : "SALE",
        propertyAddress: data.propertyAddress,
        propertyCity:    data.propertyCity,
        propertyPrice:   priceAgorot,
        commission:      commAgorot,
        clientName:      data.clientName,
        clientPhone:     data.clientPhone,
        clientEmail:     data.clientEmail,
        clientIdNumber:      data.clientId,
        existingClientDbId:        data.existingClientDbId || null,
        propertyId:                data.propertyId || null,
        hideFullAddressFromClient: data.hideFullAddressFromClient,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? "שגיאה בשליחת החוזה");
    }
    const contract = await res.json();
    setCreatedId(contract.id);
    setCreatedSignatureToken(contract.signatureToken ?? "");
    setSent(true);
  } catch (err) {
    setSubmitError(err instanceof Error ? err.message : "שגיאה בשליחת החוזה. אנא נסה שוב.");
  } finally {
    setSubmitting(false);
  }
}
  return (
    <>
      {/* Page header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center gap-4 shrink-0">
        <Link href="/contracts" className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">חוזה חדש</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 hidden sm:block">יצירת חוזה תיווך ושליחה ללקוח</p>
        </div>
      </header>

      {/* Wizard body */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-xl mx-auto">
          <StepIndicator current={step} />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            {step === 1 && <Step1 data={data} set={update} />}
            {step === 2 && <Step2 data={data} set={update} />}
            {step === 3 && <Step3 data={data} set={update} />}
            {step === 4 && <Step4 data={data} set={update} />}
            {step === 5 && <Step5 data={data} set={update} />}
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              הקודם
            </button>

            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                הבא
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendContract}
                disabled={!canAdvance || submitting}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm shadow-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {submitting ? "שולח..." : "שלח חוזה ללקוח"}
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
