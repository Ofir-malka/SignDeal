"use client";

import { useState } from "react";

interface ReminderModalProps {
  clientName: string;
  clientPhone: string;
  onSend?: (message: string) => void;
}

export function ReminderModal({ clientName, clientPhone, onSend }: ReminderModalProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"whatsapp" | "sms">("whatsapp");
  const [sent, setSent] = useState(false);

  function handleSend() {
  setOpen(false);
  setSent(true);
  onSend?.(`נשלחה תזכורת ללקוח דרך ${method === "whatsapp" ? "WhatsApp" : "SMS"}`);
  setTimeout(() => setSent(false), 3000);
}

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        {sent ? "נשלח בהצלחה" : "שלח תזכורת"}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">שליחת תזכורת</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="divide-y divide-gray-100 mb-5">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-500">לקוח</span>
                <span className="text-sm font-medium text-gray-900">{clientName}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-500">טלפון</span>
                <span className="text-sm font-medium text-gray-900">{clientPhone}</span>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm text-gray-500 mb-2">דרך שליחה</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("whatsapp")}
                  className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                    method === "whatsapp"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("sms")}
                  className={`py-2 rounded-lg text-sm font-medium border transition-all ${
                    method === "sms"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  SMS
                </button>
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm text-gray-500 mb-2">הודעה מוכנה</p>
              <textarea
                defaultValue={`שלום ${clientName}, רציתי להזכיר לך לגבי החוזה שנשלח אליך במערכת SignDeal. אפשר להיכנס לקישור ולחתום בצורה מאובטחת.`}
                className="w-full h-28 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <p className="text-xs text-gray-400 mb-5">
              בשלב זה זו תצוגת דמו בלבד — בהמשך נחבר שליחה אמיתית ב־WhatsApp/SMS.
            </p>

            <button
              type="button"
              onClick={handleSend}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 rounded-lg transition-all"
            >
              שלח תזכורת
            </button>
          </div>
        </div>
      )}
    </>
  );
}