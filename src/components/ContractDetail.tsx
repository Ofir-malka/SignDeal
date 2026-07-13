"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Contract, SignatureStatus, PaymentStatus } from "@/lib/contracts-data";
import { ContractDealWrapper } from "@/components/ContractDealWrapper";
import { hidesFeeChrome } from "@/lib/contracts/contract-types";
import { parsePropertyAddress } from "@/lib/format-address";

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
  "ממתין לתשלום": { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500"   },
  שולם:           { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-500"  },
  נכשל:           { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500"     },
  בוטל:           { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400"    },
  הוחזר:          { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500"  },
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

// ─── Signature audit strip (expandable) ──────────────────────────────────────

function SignatureAuditStrip({ contract: c }: { contract: Contract }) {
  const [open, setOpen] = useState(false);

  const hasDetails = !!(c.signatureHashPrefix || c.signatureIpMasked);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Summary row — always visible ── */}
      <div className="flex items-center gap-3 p-4">
        {/* Green shield icon */}
        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">החתימה אומתה ונשמרה במערכת</p>
          {c.signedDate && (
            <p className="text-xs text-gray-400 mt-0.5">נחתם ב‑{c.signedDate}</p>
          )}
        </div>

        {/* Expand toggle — only when there are details to show */}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
            aria-expanded={open}
          >
            {open ? "סגור" : "פרטים"}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Expanded details ── */}
      {open && hasDetails && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2.5 bg-gray-50">
          {c.hasSignature && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">חתימה גרפית</span>
              <span className="text-emerald-600 font-medium flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                נשמרה
              </span>
            </div>
          )}
          {c.signatureHashPrefix && (
            <div className="flex items-center justify-between text-xs gap-4">
              <span className="text-gray-500 shrink-0">מזהה חתימה</span>
              <code className="text-gray-600 font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded text-[11px] truncate">
                {c.signatureHashPrefix}…
              </code>
            </div>
          )}
          {c.signatureIpMasked && (
            <div className="flex items-center justify-between text-xs gap-4">
              <span className="text-gray-500 shrink-0">רשת חתימה</span>
              <code className="text-gray-600 font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded text-[11px]">
                {c.signatureIpMasked}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Owner two-document package blocks ────────────────────────────────────────

// Shown on the PRIMARY service-order detail when a linked general exclusivity
// document exists — the package is one broker-facing flow, but the secondary
// is a separate legal document with its own signing link and status.
function LinkedExclusivityCard({ linked }: { linked: NonNullable<Contract["linkedExclusivity"]> }) {
  const [copied, setCopied] = useState(false);
  const signingLink =
    typeof window !== "undefined" && linked.signatureToken
      ? `${window.location.origin}/contracts/sign/${linked.signatureToken}`
      : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        מסמך מקושר
      </h3>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">הסכם בלעדיות</p>
            <p className="text-xs text-gray-400 mt-0.5">הסכם בלעדיות נשלח כחלק מחבילת החתמה זו.</p>
          </div>
          <StatusBadge status={linked.signatureStatus} styleMap={SIG_STYLE} />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Link
            href={`/contracts/${linked.contractId}`}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white text-center hover:bg-indigo-700 transition-all"
          >
            צפייה במסמך
          </Link>
          {signingLink && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(signingLink).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              {copied ? "✓ הועתק!" : "העתק קישור לחתימה"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Shown when the SECONDARY exclusivity document is opened directly — links the
// broker back to the primary service-order agreement of the package.
function LinkedPrimaryStrip({ primaryId }: { primaryId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
      <p className="text-sm text-indigo-900 font-medium">מסמך זה מקושר להסכם תיווך</p>
      <Link
        href={`/contracts/${primaryId}`}
        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
      >
        צפייה בהסכם התיווך
      </Link>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ContractDetail({ contract: c }: { contract: Contract }) {
  const isSigned = c.signatureStatus === "נחתם" ||
                   c.signatureStatus === "ממתין לתשלום" ||
                   c.signatureStatus === "שולם";

  return (
    <ContractDealWrapper
      contract={c}
      infoCards={
        <>
        {/* Secondary exclusivity document opened directly — back-link strip */}
        {c.linkedPrimaryContractId && <LinkedPrimaryStrip primaryId={c.linkedPrimaryContractId} />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          {/* Cooperation documents: the signing party is Broker B, not a client —
              document-facing title (deliberately "פרטי המתווך", not the creation
              form's "פרטי המתווך השני"). */}
          <InfoCard
            title={c.templateKey === "BROKER_COOP_SHARED_POOL" ? "פרטי המתווך" : "פרטי לקוח"}
            rows={[
              { label: "שם מלא",      value: c.client      },
              { label: "טלפון",       value: c.clientPhone  },
              { label: "אימייל",      value: c.clientEmail  },
              { label: "תעודת זהות", value: c.clientId     },
            ]}
          />
          <InfoCard
            title="פרטי נכס"
            rows={(() => {
              const { address, floor, apartment } = parsePropertyAddress(c.propertyAddress);
              return [
                { label: "כתובת",    value: address           },
                { label: "עיר",      value: c.propertyCity    },
                ...(floor     ? [{ label: "קומה", value: floor     }] : []),
                ...(apartment ? [{ label: "דירה", value: apartment }] : []),
                { label: "סוג עסקה", value: c.dealType === "גם וגם" ? c.contractType : c.dealType },
                { label: c.dealType === "מכירה" ? "מחיר רכישה" : "שכירות חודשית", value: c.propertyPrice },
                ...(c.dealType === "גם וגם" && c.propertySalePrice
                  ? [{ label: "מחיר מכירה", value: c.propertySalePrice }] : []),
              ];
            })()}
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
              // Fee row is key-gated off for fee-free documents (the general
              // exclusivity agreement carries no fee terms of its own).
              ...(hidesFeeChrome(c.templateKey) ? [] : [{ label: "עמלה", value: c.commission as ReactNode }]),
              { label: "נשלח בתאריך", value: c.sentDate     },
              { label: "נחתם בתאריך", value: c.signedDate   },
            ]}
          />

          {/* Linked exclusivity document — owner two-document package */}
          {c.linkedExclusivity && <LinkedExclusivityCard linked={c.linkedExclusivity} />}

          {/* Signature audit strip — only shown when signed */}
          {isSigned && <SignatureAuditStrip contract={c} />}
        </div>
        </>
      }
    />
  );
}