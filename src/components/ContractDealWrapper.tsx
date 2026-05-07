"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Contract } from "@/lib/contracts-data";
import { ReminderModal } from "@/components/ReminderModal";
import { ContractTemplate } from "@/components/ContractTemplate";

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TimelineEvent = {
  label: string;
  date: string | null;
  state: "done" | "pending" | "future";
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">
        ציר זמן
      </h3>
      <div className="relative">
        <div className="absolute top-4 bottom-4 start-4 w-px bg-gray-200" />
        <div className="space-y-5">
          {events.map((ev, i) => (
            <div key={i} className="relative flex items-start gap-4">
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  ev.state === "done"
                    ? "bg-indigo-600"
                    : ev.state === "pending"
                    ? "bg-amber-400"
                    : "bg-gray-100 border-2 border-gray-200"
                }`}
              >
                {ev.state === "done" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {ev.state === "pending" && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
              </div>
              <div className="pt-1">
                <p className={`text-sm font-medium ${ev.state === "future" ? "text-gray-400" : "text-gray-900"}`}>
                  {ev.label}
                </p>
                {ev.date && <p className="text-xs text-gray-500 mt-0.5">{ev.date}</p>}
                {ev.state === "pending" && !ev.date && (
                  <p className="text-xs text-amber-600 mt-0.5">ממתין...</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0"))   return "972" + digits.slice(1);
  return "972" + digits;
}

// ─── Local payment shape (returned by POST /api/contracts/[id]/payment-request) ─

type LocalPayment = {
  status:     string;
  paymentUrl: string | null;
  paidAt:     string | null;
};

// G1.1: Map English Prisma enum → Hebrew display strings used throughout this component
const PAY_STATUS_MAP: Record<string, string> = {
  PENDING:  "ממתין לתשלום",
  PAID:     "שולם",
  FAILED:   "נכשל",
  CANCELED: "בוטל",
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function ContractDealWrapper({
  contract: c,
  infoCards,
}: {
  contract: Contract;
  infoCards: ReactNode;
}) {
  const [localDealClosed, setLocalDealClosed] = useState(c.dealClosed);
  const [localCanceled, setLocalCanceled]     = useState(c.signatureStatus === "בוטל");
  const [activityLog, setActivityLog]         = useState<string[]>([]);
  const [copied, setCopied]                   = useState(false);
  const [copiedPayUrl, setCopiedPayUrl]       = useState(false);
  const [sendingPaySms, setSendingPaySms]     = useState(false);
  const [paySmsResult, setPaySmsResult]       = useState<"sent" | "failed" | null>(null);
  const [paySmsError, setPaySmsError]         = useState<string | null>(null);
  const copiedTimeoutRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedPayUrlTimeoutRef                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderSentTimeoutRef                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reminderSent, setReminderSent]       = useState(false);
  const [dealClosedError, setDealClosedError] = useState<string | null>(null);
  const [paymentError, setPaymentError]       = useState<string | null>(null);
  const [cancelError, setCancelError]         = useState<string | null>(null);
  const [showContract, setShowContract]       = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);

  // Initialise from contract's existing payment record (if any)
  const [localPayment, setLocalPayment] = useState<LocalPayment | null>(
    c.paymentStatus
      ? { status: c.paymentStatus, paymentUrl: c.paymentUrl ?? null, paidAt: c.paidDate ?? null }
      : null
  );

  function addActivity(message: string) {
    setActivityLog((prev) => [
      `${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} — ${message}`,
      ...prev,
    ]);
  }

  function handleCopyLink() {
    if (!c.signatureToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/contracts/sign/${c.signatureToken}`);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    setCopied(true);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyPayUrl(url: string) {
    navigator.clipboard.writeText(url);
    if (copiedPayUrlTimeoutRef.current) clearTimeout(copiedPayUrlTimeoutRef.current);
    setCopiedPayUrl(true);
    copiedPayUrlTimeoutRef.current = setTimeout(() => setCopiedPayUrl(false), 2000);
  }

  async function sendPaymentSms() {
    setSendingPaySms(true);
    setPaySmsResult(null);
    setPaySmsError(null);
    try {
      const res  = await fetch(`/api/contracts/${c.id}/payment-request/send-sms`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaySmsResult("failed");
        setPaySmsError(data.error ?? "שגיאה בשליחת SMS");
      } else if (data.success) {
        setPaySmsResult("sent");
        addActivity("נשלחה בקשת תשלום ב-SMS ללקוח");
      } else {
        setPaySmsResult("failed");
        setPaySmsError(data.reason ?? "שגיאה בשליחת SMS");
      }
    } catch {
      setPaySmsResult("failed");
      setPaySmsError("שגיאה בשליחת SMS");
    } finally {
      setSendingPaySms(false);
    }
  }

  function handleWhatsApp() {
    if (!c.signatureToken) return;
    const signingLink = `${window.location.origin}/contracts/sign/${c.signatureToken}`;
    const phone       = normalizePhone(c.clientPhone);
    const message     =
      `שלום ${c.client},\n` +
      `מצורף קישור לחתימה דיגיטלית על חוזה תיווך עם SignDeal.\n\n` +
      `לחתימה על החוזה:\n${signingLink}\n\n` +
      `בברכה,\nצוות SignDeal`;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function handleReminderSent() {
    addActivity("נשלחה תזכורת ללקוח לחתימה על החוזה");
    if (reminderSentTimeoutRef.current) clearTimeout(reminderSentTimeoutRef.current);
    setReminderSent(true);
    reminderSentTimeoutRef.current = setTimeout(() => setReminderSent(false), 3000);
  }

  async function markDealClosed() {
    setLocalDealClosed(true);
    setDealClosedError(null);

    try {
      const res = await fetch(`/api/contracts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealClosed: true, dealClosedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalDealClosed(false);
      setDealClosedError("שגיאה בשמירת הנתונים. אנא נסה שוב.");
      return;
    }

    window.dispatchEvent(new Event("contractsUpdated"));
    addActivity("העסקה סומנה כנסגרה מול בעל הנכס");
  }

  async function handleCancel() {
    const confirmed = window.confirm(`לבטל את החוזה של ${c.client}? פעולה זו אינה ניתנת לביטול.`);
    if (!confirmed) return;

    setLocalCanceled(true);
    setCancelError(null);

    try {
      const res = await fetch(`/api/contracts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureStatus: "CANCELED" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalCanceled(false);
      setCancelError("שגיאה בביטול החוזה. אנא נסה שוב.");
      return;
    }

    window.dispatchEvent(new Event("contractsUpdated"));
    addActivity("החוזה בוטל");
  }

  async function createPaymentRequest() {
    setCreatingPayment(true);
    setPaymentError(null);
    try {
      const res = await fetch(`/api/contracts/${c.id}/payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPaymentError(body.error ?? "שגיאה ביצירת בקשת תשלום");
        return;
      }
      const payment = await res.json();
      // G1.1: API returns English enum (e.g. "PENDING"); map to Hebrew for UI comparisons
      setLocalPayment({
        status:     PAY_STATUS_MAP[payment.status] ?? payment.status,
        paymentUrl: payment.paymentUrl ?? null,
        paidAt:     payment.paidAt ?? null,
      });
      window.dispatchEvent(new Event("contractsUpdated"));
      addActivity(`נוצרה בקשת תשלום על סך ${c.commission}`);
    } catch {
      setPaymentError("שגיאה ביצירת בקשת תשלום");
    } finally {
      setCreatingPayment(false);
    }
  }

  const isPaid        = localPayment?.status === "שולם";
  const paymentPending =
    !localCanceled &&
    c.signatureStatus === "נחתם" &&
    localDealClosed &&
    !isPaid;

  // True once the client has signed — includes downstream statuses (PAYMENT_PENDING, PAID)
  const isSignedOrBeyond =
    c.signatureStatus === "נחתם" ||
    c.signatureStatus === "ממתין לתשלום" ||
    c.signatureStatus === "שולם";

  const timelineEvents: TimelineEvent[] = [
    {
      label: "חוזה נוצר",
      date:  c.createdDate,
      state: "done",
    },
    {
      label: "נשלח ללקוח",
      date:  c.sentDate !== "—" ? c.sentDate : null,
      state: c.signatureStatus !== "טיוטה" ? "done" : "future",
    },
    {
      label: "נחתם על ידי הלקוח",
      date:  c.signedDate,
      state: c.signedDate ? "done" : c.signatureStatus === "נשלח" ? "pending" : "future",
    },
    {
      label: "עסקה נסגרה מול בעל הנכס",
      date:  localDealClosed ? c.dealClosedDate : null,
      state: localDealClosed ? "done" : c.signatureStatus === "נחתם" ? "pending" : "future",
    },
    {
      label: isPaid ? "עמלה התקבלה" : "ממתין לתשלום",
      date:  localPayment?.paidAt ?? null,
      state: isPaid
        ? "done"
        : localPayment || (localDealClosed && c.signatureStatus === "נחתם")
        ? "pending"
        : "future",
    },
  ];

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/contracts" className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">פרטי חוזה</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
              {c.contractType} — {c.client}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {!localCanceled && (c.signatureStatus === "נשלח" || c.signatureStatus === "נפתח") && (
            <ReminderModal
              contractId={String(c.id)}
              signatureToken={c.signatureToken ?? ""}
              clientName={c.client}
              clientPhone={c.clientPhone}
              onSend={handleReminderSent}
            />
          )}
          {reminderSent && (
            <span className="text-xs font-medium text-emerald-600 whitespace-nowrap">התזכורת נשלחה ✓</span>
          )}

          {!localCanceled && (
            isSignedOrBeyond ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-400 cursor-default"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                החוזה כבר נחתם
              </button>
            ) : !!c.signatureToken ? (
              // G1.4: Only render sharing buttons when a signatureToken exists
              <>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="hidden sm:inline">{copied ? "הועתק" : "העתק קישור חתימה"}</span>
                  <span className="sm:hidden">{copied ? "✓" : "קישור"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-emerald-200 bg-white text-xs sm:text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                  <span className="hidden sm:inline">שלח בוואטסאפ</span>
                  <span className="sm:hidden">WA</span>
                </button>
              </>
            ) : null
          )}

          {!localCanceled && c.signatureToken && (
            <Link
              href={`/contracts/sign/${c.signatureToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span className="hidden sm:inline">צפה בעמוד חתימה</span>
              <span className="sm:hidden">חתימה</span>
            </Link>
          )}

          {/* Payment request button — header variant */}
          {paymentPending && !localPayment && (
            <button
              type="button"
              onClick={createPaymentRequest}
              disabled={creatingPayment}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <span className="hidden sm:inline">{creatingPayment ? "יוצר..." : "צור בקשת תשלום"}</span>
              <span className="sm:hidden">{creatingPayment ? "..." : "תשלום"}</span>
            </button>
          )}

          {/* Disabled payment button when not yet eligible — hidden for terminal statuses */}
          {(!paymentPending || localPayment) && !localCanceled && c.signatureStatus !== "פג תוקף" && (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium border border-gray-200 bg-white text-gray-400 cursor-default transition-all"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <span className="hidden sm:inline">בקשת תשלום</span>
              <span className="sm:hidden">תשלום</span>
            </button>
          )}

          <a
            href={`/api/contracts/${c.id}/pdf`}
            download
            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PDF
          </a>

          {!localCanceled && (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-red-200 bg-white text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
            >
              <span className="hidden sm:inline">בטל חוזה</span>
              <span className="sm:hidden">בטל</span>
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
        {cancelError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-700">{cancelError}</p>
          </div>
        )}

        {localCanceled && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">החוזה בוטל</p>
              <p className="text-xs text-red-600 mt-0.5">חוזה זה בוטל ואינו פעיל. לא ניתן לבצע פעולות נוספות.</p>
            </div>
          </div>
        )}
        {infoCards}

        <div className="mb-6">
          <Timeline events={timelineEvents} />
        </div>

        {/* Contract document */}
        <div className="mb-6 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">מסמך החוזה</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{c.contractType}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isSignedOrBeyond ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  נחתם
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  טרם נחתם
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowContract((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                {showContract ? "הסתר מסמך" : "צפה במסמך החוזה"}
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform duration-200 ${showContract ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>

          {showContract && <ContractTemplate contract={c} />}
        </div>

        {isSignedOrBeyond && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">החוזה נחתם</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                הלקוח חתם על החוזה בתאריך {c.signedDate ?? "תאריך לא זמין"}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                בגרסה המלאה יופיע כאן תיעוד חתימה מלא כולל IP, זמן חתימה ו-PDF חתום.
              </p>
            </div>
          </div>
        )}

        {activityLog.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              היסטוריית פעולות
            </h3>
            <div className="space-y-3">
              {activityLog.map((item, index) => (
                <div key={index} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-700">{paymentError}</p>
          </div>
        )}

        {/* Payment CTA — eligible and no request yet */}
        {paymentPending && !localPayment && (
          <div className="bg-indigo-600 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-white">
                החוזה נחתם — אפשר לשלוח בקשת תשלום
              </p>
              <p className="text-sm text-indigo-200 mt-1">
                צור בקשת תשלום של {c.commission} עבור {c.client}
              </p>
            </div>
            <button
              type="button"
              onClick={createPaymentRequest}
              disabled={creatingPayment}
              className="shrink-0 bg-white hover:bg-indigo-50 text-indigo-700 font-semibold text-sm px-5 py-2.5 rounded-lg transition-all whitespace-nowrap disabled:opacity-60"
            >
              {creatingPayment ? "יוצר..." : "צור בקשת תשלום"}
            </button>
          </div>
        )}

        {/* Payment request created — PENDING, no real paymentUrl yet */}
        {localPayment?.status === "ממתין לתשלום" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">בקשת תשלום נוצרה — ממתין לתשלום</p>
              {localPayment.paymentUrl ? (
                <>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <a
                      href={localPayment.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline truncate max-w-xs"
                    >
                      {localPayment.paymentUrl}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyPayUrl(localPayment.paymentUrl!)}
                      className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-100 whitespace-nowrap"
                    >
                      {copiedPayUrl ? "הועתק ✓" : "העתק קישור"}
                    </button>
                    <button
                      type="button"
                      onClick={sendPaymentSms}
                      disabled={sendingPaySms}
                      className="text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                    >
                      {sendingPaySms
                        ? "שולח..."
                        : paySmsResult === "sent"
                        ? "נשלח ✓"
                        : "שלח ב-SMS"}
                    </button>
                  </div>
                  {paySmsResult === "failed" && paySmsError && (
                    <p className="text-xs text-red-600 mt-1">{paySmsError}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-600 mt-1">
                  קישור תשלום יהיה זמין לאחר חיבור ספק סליקה (שלב 2)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Payment received — PAID */}
        {isPaid && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">העמלה התקבלה — העסקה הושלמה</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                תשלום של {c.commission} התקבל{localPayment?.paidAt ? ` בתאריך ${localPayment.paidAt}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Payment failed */}
        {localPayment?.status === "נכשל" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800">בקשת התשלום נכשלה</p>
                <p className="text-xs text-red-600 mt-0.5">ניתן ליצור בקשה חדשה</p>
              </div>
            </div>
            <button
              type="button"
              onClick={createPaymentRequest}
              disabled={creatingPayment}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 whitespace-nowrap"
            >
              {creatingPayment ? "יוצר..." : "צור בקשה מחדש"}
            </button>
          </div>
        )}

        {dealClosedError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-700">{dealClosedError}</p>
          </div>
        )}

        {!localCanceled && c.signatureStatus === "נחתם" && !localDealClosed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm font-semibold text-amber-800">
              החוזה נחתם — סמן שהעסקה נסגרה מול בעל הנכס כדי לשלוח בקשת תשלום
            </p>
            <button
              type="button"
              onClick={markDealClosed}
              className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-all whitespace-nowrap"
            >
              סמן עסקה כנסגרה
            </button>
          </div>
        )}

        {c.signatureStatus === "פג תוקף" && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">החוזה פג תוקף ואינו זמין לחתימה. ניתן לבטל ולהפיק חוזה חדש ללקוח.</p>
          </div>
        )}

        {!localCanceled && !localPayment && !isSignedOrBeyond && c.signatureStatus !== "פג תוקף" && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              {c.signatureStatus === "טיוטה"
                ? "החוזה עדיין בטיוטה — שלח ללקוח לחתימה כדי להמשיך."
                : "ממתין לחתימת הלקוח — בקשת התשלום תהיה זמינה לאחר החתימה."}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
