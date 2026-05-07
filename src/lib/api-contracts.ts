import type { Contract, SignatureStatus, PaymentStatus } from "@/lib/contracts-data";

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
  signatureData: string | null;
  signatureHash: string | null;
  userAgent:     string | null;
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

const DEAL_TYPE_MAP: Record<string, "שכירות" | "מכירה"> = {
  RENTAL: "שכירות", SALE: "מכירה",
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
    property:        `${c.propertyAddress}, ${c.propertyCity}`,
    dealType:        DEAL_TYPE_MAP[c.dealType]    ?? "שכירות",
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
  };
}
