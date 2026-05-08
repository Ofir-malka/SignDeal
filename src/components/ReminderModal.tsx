"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReminderModalProps {
  contractId:     string;
  signatureToken: string;
  clientName:     string;
  clientPhone:    string;
  onSend?:        (message: string) => void;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0"))   return "972" + digits.slice(1);
  return "972" + digits;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReminderModal({
  contractId,
  signatureToken,
  clientName,
  clientPhone,
  onSend,
}: ReminderModalProps) {
  const [open,    setOpen]    = useState(false);
  const [method,  setMethod]  = useState<"sms" | "whatsapp">("sms");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const sentTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signingLink = typeof window !== "undefined"
    ? `${window.location.origin}/contracts/sign/${signatureToken}`
    : `https://www.signdeal.co.il/contracts/sign/${signatureToken}`;

  const reminderBody =
    `שלום ${clientName}, תזכורת: עדיין לא חתמת על ההסכם שנשלח אליך. ` +
    `לחתימה דיגיטלית: ${signingLink}`;

  function showSent(channel: string) {
    setOpen(false);
    setSent(true);
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
    sentTimerRef.current = setTimeout(() => setSent(false), 3000);
    onSend?.(`נשלחה תזכורת ללקוח דרך ${channel}`);
  }

  async function handleSendSms() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/send-reminder`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? data.reason ?? "שגיאה בשליחת התזכורת");
        return;
      }
      showSent("SMS");
    } catch {
      setError("שגיאה בחיבור לשרת. אנא נסה שוב.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendWhatsApp() {
    setSending(true);
    setError(null);
    try {
      // Record the WhatsApp send intent on the server (creates an auditable Message row).
      // The actual message is sent manually by the broker through the wa.me link below.
      const res = await fetch(`/api/contracts/${contractId}/send-reminder`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ channel: "WHATSAPP" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "שגיאה בתיעוד שליחת WhatsApp");
        return;
      }
    } catch {
      // Network error — still open wa.me so the broker isn't blocked, but warn
      setError("לא ניתן היה לתעד את ההודעה בשרת, אך WhatsApp נפתח");
    } finally {
      setSending(false);
    }

    const phone   = normalizePhone(clientPhone);
    const message =
      `שלום ${clientName},\n` +
      `תזכורת: עדיין לא חתמת על ההסכם שנשלח אליך.\n\n` +
      `לחתימה דיגיטלית:\n${signingLink}\n\n` +
      `בברכה,\nSignDeal`;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    showSent("WhatsApp");
  }

  async function handleSend() {
    if (method === "sms") {
      await handleSendSms();
    } else {
      await handleSendWhatsApp();
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <span className="hidden sm:inline">{sent ? "נשלח ✓" : "שלח תזכורת"}</span>
        <span className="sm:hidden">{sent ? "✓" : "תזכורת"}</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">שליחת תזכורת</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Client info */}
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-500">לקוח</span>
                  <span className="text-sm font-medium text-gray-900">{clientName}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-500">טלפון</span>
                  <span className="text-sm font-medium text-gray-900">{clientPhone}</span>
                </div>
              </div>

              {/* Channel selector */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2.5">דרך שליחה</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["sms", "whatsapp"] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setMethod(ch)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        method === ch
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {ch === "sms" ? "SMS" : "WhatsApp"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message preview */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1.5">הודעה שתישלח</p>
                <div className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-600 leading-relaxed whitespace-pre-line max-h-28 overflow-y-auto">
                  {reminderBody}
                </div>
              </div>

              {/* WhatsApp info note */}
              {method === "whatsapp" && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <svg className="shrink-0 text-emerald-600 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    תיפתח שיחת WhatsApp עם ההודעה מוכנה לשליחה. הלחיצה על &quot;שלח&quot; תשלח את ההודעה.
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
                  <svg className="shrink-0 text-red-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={sending}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "שולח..." : "שלח תזכורת"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
