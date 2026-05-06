import type { ReactNode } from "react";
import type { Contract, SignatureStatus, PaymentStatus } from "@/lib/contracts-data";
import { ContractDealWrapper } from "@/components/ContractDealWrapper";

// ─── Status badges ────────────────────────────────────────────────────────────

const SIG_STYLE: Record<SignatureStatus, { bg: string; text: string; dot: string }> = {
  טיוטה:         { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400"    },
  נשלח:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500"    },
  נפתח:          { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500"  },
  נחתם:          { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "ממתין לתשלום": { bg: "bg-amber-50",  text: "text-amber-700",   dot: "bg-amber-500"   },
  שולם:          { bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-500"    },
  "פג תוקף":     { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-300"    },
  בוטל:          { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400"     },
};

const PAY_STYLE: Record<NonNullable<PaymentStatus>, { bg: string; text: string; dot: string }> = {
  "ממתין לתשלום": { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500"  },
  שולם:           { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  נכשל:           { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500"    },
  בוטל:           { bg: "bg-gray-100",  text: "text-gray-500",   dot: "bg-gray-400"   },
};

function StatusBadge({
  status,
  styleMap,
}: {
  status: string;
  styleMap: Record<string, { bg: string; text: string; dot: string }>;
}) {
  const s = styleMap[status] ?? { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// ─── Info card ────────────────────────────────────────────────────────────────

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      <div className="divide-y divide-gray-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between py-2.5 first:pt-0 last:pb-0 gap-4"
          >
            <span className="text-sm text-gray-500 shrink-0">{row.label}</span>
            <span className="text-sm font-medium text-gray-900 text-left">{row.value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ContractDetail({ contract: c }: { contract: Contract }) {
  return (
    <ContractDealWrapper
      contract={c}
      infoCards={
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          <InfoCard
            title="פרטי לקוח"
            rows={[
              { label: "שם מלא",      value: c.client      },
              { label: "טלפון",       value: c.clientPhone  },
              { label: "אימייל",      value: c.clientEmail  },
              { label: "תעודת זהות", value: c.clientId     },
            ]}
          />
          <InfoCard
            title="פרטי נכס"
            rows={[
              { label: "כתובת",    value: c.propertyAddress },
              { label: "עיר",      value: c.propertyCity    },
              { label: "סוג עסקה", value: c.dealType        },
              { label: "מחיר",     value: c.propertyPrice   },
            ]}
          />
          <InfoCard
            title="פרטי חוזה"
            rows={[
              { label: "סוג חוזה",     value: c.contractType },
              { label: "סטטוס חתימה",  value: <StatusBadge status={c.signatureStatus} styleMap={SIG_STYLE} /> },
              { label: "סטטוס תשלום",  value: c.paymentStatus
                  ? <StatusBadge status={c.paymentStatus} styleMap={PAY_STYLE} />
                  : "—"
              },
              { label: "עמלה",         value: c.commission  },
              { label: "נשלח בתאריך", value: c.sentDate     },
            ]}
          />
        </div>
      }
    />
  );
}