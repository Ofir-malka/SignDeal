/**
 * /payments — Broker payment history.
 *
 * Shows all Payment rows for this broker's contracts, with Stripe fee breakdown,
 * transfer status, and payout status when available.
 *
 * Rapyd / legacy payments display gracefully with "—" for Stripe-only columns.
 *
 * ⚠ This page is for CLIENT-TO-BROKER brokerage payments only.
 *   SaaS subscription billing (HYP) is at /settings/billing.
 */

export const dynamic = "force-dynamic";

import Link              from "next/link";
import { redirect }      from "next/navigation";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { DashboardShell } from "@/components/DashboardShell";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentRow = {
  id:               string;
  status:           string;
  provider:         string | null;
  grossAmount:      number | null;
  processorFee:     number | null;
  platformFee:      number | null;
  netAmount:        number | null;
  paidAt:           Date | null;
  stripeTransferId: string | null;
  transferStatus:   string | null;
  payoutId:         string | null;
  payoutEvent: {
    status:      string;
    arrivalDate: Date | null;
    failureCode: string | null;
  } | null;
  contract: {
    id:              string;
    propertyAddress: string;
    propertyCity:    string;
    client: { name: string };
  };
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PaymentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const payments = await prisma.payment.findMany({
    where:   { contract: { userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id:               true,
      status:           true,
      provider:         true,
      grossAmount:      true,
      processorFee:     true,
      platformFee:      true,
      netAmount:        true,
      paidAt:           true,
      stripeTransferId: true,
      transferStatus:   true,
      payoutId:         true,
      payoutEvent: {
        select: {
          status:      true,
          arrivalDate: true,
          failureCode: true,
        },
      },
      contract: {
        select: {
          id:              true,
          propertyAddress: true,
          propertyCity:    true,
          client: { select: { name: true } },
        },
      },
    },
  }) satisfies PaymentRow[];

  return (
    <DashboardShell>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">תשלומים</h1>
          <p className="text-sm text-gray-500 mt-0.5">היסטוריית עמלות ועיבוד תשלומים</p>
        </div>
        <span className="text-sm text-gray-400">
          {payments.length > 0 ? `${payments.length} תשלומים` : ""}
        </span>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main dir="rtl" className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8">
        {payments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-right">
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">לקוח / נכס</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">תאריך תשלום</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-left">סכום ברוטו</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-left">עמלת עיבוד</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-left">עמלת פלטפורמה</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-left">נטו למתווך</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">סטטוס תשלום</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">העברה</th>
                    <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">הפקדה לחשבון</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <PaymentTableRow key={p.id} payment={p} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </DashboardShell>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function PaymentTableRow({ payment: p }: { payment: PaymentRow }) {
  const isStripe = p.provider === "stripe";

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Client / Property */}
      <td className="px-4 py-3.5">
        <Link
          href={`/contracts/${p.contract.id}`}
          className="group block"
        >
          <span className="font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">
            {p.contract.client.name}
          </span>
          <span className="block text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
            {shortAddress(p.contract.propertyAddress)}, {p.contract.propertyCity}
          </span>
        </Link>
      </td>

      {/* Paid date */}
      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
        {formatDate(p.paidAt)}
      </td>

      {/* Gross amount */}
      <td className="px-4 py-3.5 text-left font-mono text-gray-900 whitespace-nowrap">
        {formatNIS(p.grossAmount)}
      </td>

      {/* Processor fee (Stripe / provider cut) */}
      <td className="px-4 py-3.5 text-left font-mono whitespace-nowrap">
        {isStripe && (p.processorFee ?? 0) > 0
          ? <span className="text-gray-500">{formatNIS(p.processorFee)}</span>
          : <span className="text-gray-300">—</span>
        }
      </td>

      {/* Platform fee (SignDeal cut) */}
      <td className="px-4 py-3.5 text-left font-mono whitespace-nowrap">
        {isStripe
          ? <span className="text-gray-500">{formatNIS(p.platformFee)}</span>
          : <span className="text-gray-300">—</span>
        }
      </td>

      {/* Net amount */}
      <td className="px-4 py-3.5 text-left font-mono font-semibold text-gray-900 whitespace-nowrap">
        {formatNIS(p.netAmount)}
      </td>

      {/* Payment status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <PaymentStatusBadge status={p.status} />
      </td>

      {/* Transfer status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <TransferStatusBadge transferStatus={p.transferStatus} isStripe={isStripe} />
      </td>

      {/* Payout status */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <PayoutStatusBadge payoutEvent={p.payoutEvent} isStripe={isStripe} />
      </td>
    </tr>
  );
}

// ── Status badges ─────────────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    PENDING:  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   label: "ממתין"  },
    PAID:     { bg: "bg-green-50",   text: "text-green-700",   dot: "bg-green-500",   label: "שולם"   },
    FAILED:   { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500",     label: "נכשל"   },
    CANCELED: { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400",    label: "בוטל"   },
    REFUNDED: { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500",  label: "הוחזר"  },
  };
  const s = styles[status] ?? styles.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function TransferStatusBadge({
  transferStatus,
  isStripe,
}: {
  transferStatus: string | null;
  isStripe:       boolean;
}) {
  if (!isStripe) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (transferStatus === "paid") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        הועבר
      </span>
    );
  }
  if (transferStatus === "reversed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        בוטל
      </span>
    );
  }
  // Stripe payment but no transfer yet (PENDING or just-paid before webhook fires)
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
      ממתין
    </span>
  );
}

function PayoutStatusBadge({
  payoutEvent,
  isStripe,
}: {
  payoutEvent: PaymentRow["payoutEvent"];
  isStripe:    boolean;
}) {
  if (!isStripe) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (!payoutEvent) {
    // Stripe payment but no payout yet — transfer hasn't been swept to bank
    return (
      <span className="text-xs text-gray-400">ממתין להפקדה</span>
    );
  }

  const { status, arrivalDate } = payoutEvent;

  if (status === "paid") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          הופקד
        </span>
        {arrivalDate && (
          <span className="text-[11px] text-gray-400 px-1">{formatDate(arrivalDate)}</span>
        )}
      </span>
    );
  }
  if (status === "in_transit") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        בדרך לחשבון
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        הפקדה נכשלה
      </span>
    );
  }
  if (status === "canceled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        בוטל
      </span>
    );
  }
  // "pending" or unknown
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      ממתין
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6366f1"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-gray-900">אין תשלומים עדיין</p>
        <p className="text-sm text-gray-500 mt-1">תשלומים יופיעו כאן לאחר שלקוחות ישלמו עמלות</p>
      </div>
      <Link
        href="/contracts"
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200
                   bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
      >
        עבור לחוזים
      </Link>
    </div>
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Converts agorot → ILS and formats with Intl (e.g. "₪12,000") — returns "—" for null. */
function formatNIS(agorot: number | null | undefined): string {
  if (agorot == null) return "—";
  return new Intl.NumberFormat("he-IL", {
    style:                 "currency",
    currency:              "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(agorot / 100);
}

/** Formats a Date as "15 ינואר 2026" in Hebrew locale — returns "—" for null. */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("he-IL", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Returns the street part of an address (before the first comma if present). */
function shortAddress(address: string): string {
  return address.split(",")[0]?.trim() ?? address;
}
