import type { Contract, SignatureStatus, PaymentStatus } from "@/lib/contracts-data";
import { parsePropertyAddress } from "@/lib/format-address";

// ─── API response shape ───────────────────────────────────────────────────────

export type ApiContractResponse = {
  id: string;
  contractType: string;
  dealType: string;
  status: string;
  propertyAddress: string;
  propertyCity: string;
  propertyPrice: number;
  commission: number;
  commissionSale: number | null;   // set only when dealType = "BOTH"; null for SALE/RENTAL
  dealClosed: boolean;
  sentAt: string | null;
  signedAt: string | null;
  dealClosedAt: string | null;
  createdAt: string;
  client: { name: string; phone: string; email: string; idNumber: string };
  payment: {
    status:     string;
    paidAt:     string | null;
    paymentUrl: string | null;
    provider:   string | null;
  } | null;
  signatureData:  string | null;
  signatureHash?: string | null;  // broker GET only; omitted from public sign GET
  signatureIp?:   string | null;  // broker GET only
  userAgent?:     string | null;  // broker GET only
  propertyId:    string | null;
  hideFullAddressFromClient: boolean;
  templateId?:     string | null;
  generatedText?:  string | null;
  signatureToken?: string | null;
  language?:       string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isoToDateStr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function formatAgorot(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString("he-IL")}`;
}

const STATUS_MAP: Record<string, SignatureStatus> = {
  DRAFT:           "טיוטה",
  SENT:            "נשלח",
  OPENED:          "נפתח",
  SIGNED:          "נחתם",
  PAYMENT_PENDING: "ממתין לתשלום",
  PAID:            "שולם",
  EXPIRED:         "פג תוקף",
  CANCELED:        "בוטל",
};

const DEAL_TYPE_MAP: Record<string, "שכירות" | "מכירה" | "גם וגם"> = {
  RENTAL: "שכירות", SALE: "מכירה", BOTH: "גם וגם",
};

const PAY_STATUS_MAP: Record<string, NonNullable<PaymentStatus>> = {
  PENDING:  "ממתין לתשלום",
  PAID:     "שולם",
  FAILED:   "נכשל",
  CANCELED: "בוטל",
};

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function apiToContract(c: ApiContractResponse): Contract {
  return {
    id:              c.id,
    client:          c.client.name,
    contractType:    c.contractType,
    property:        `${parsePropertyAddress(c.propertyAddress).address}, ${c.propertyCity}`,
    dealType:        DEAL_TYPE_MAP[c.dealType]    ?? "שכירות",
    commissionSale:  c.commissionSale != null ? formatAgorot(c.commissionSale) : null,
    signatureStatus: STATUS_MAP[c.status]          ?? "טיוטה",
    paymentStatus:   c.payment ? (PAY_STATUS_MAP[c.payment.status] ?? null) : null,
    dealClosed:      c.dealClosed,
    dealClosedDate:  isoToDateStr(c.dealClosedAt),
    commission:      formatAgorot(c.commission),
    sentDate:        isoToDateStr(c.sentAt) ?? "—",
    clientPhone:     c.client.phone,
    clientEmail:     c.client.email,
    clientId:        c.client.idNumber,
    propertyAddress: c.propertyAddress,
    propertyCity:    c.propertyCity,
    propertyPrice:   formatAgorot(c.propertyPrice),
    createdDate:     isoToDateStr(c.createdAt) ?? "—",
    signedDate:      isoToDateStr(c.signedAt),
    paidDate:        isoToDateStr(c.payment?.paidAt ?? null),
    createdAtRaw:    c.createdAt,
    signedAtRaw:     c.signedAt  ?? null,
    paidAtRaw:       c.payment?.paidAt ?? null,
    signatureData:   c.signatureData ?? null,
    propertyId:                c.propertyId ?? null,
    paymentUrl:                c.payment?.paymentUrl ?? null,
    hideFullAddressFromClient: c.hideFullAddressFromClient,
    generatedText:             c.generatedText  ?? null,
    signatureToken:            c.signatureToken ?? null,
    language:                  c.language       ?? "HE",
    // ── Signing audit fields — only present on broker GET responses ───────────
    signatureHashPrefix: c.signatureHash ? c.signatureHash.slice(0, 12) : null,
    hasSignature:        !!c.signatureData,
    signatureIpMasked:   maskIp(c.signatureIp ?? null),
  };
}

// ── IP masking helper — hides first octet: 192.168.1.5 → "*.168.1.5" ─────────
function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // Handle IPv4
  const v4 = ip.split(".");
  if (v4.length === 4) return ["*", v4[1], v4[2], v4[3]].join(".");
  // Handle IPv6 — mask first group
  const v6 = ip.split(":");
  if (v6.length >= 2) return ["*", ...v6.slice(1)].join(":");
  return "*";
}
