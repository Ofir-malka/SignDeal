export type SignatureStatus =
  | "טיוטה"           // DRAFT
  | "נשלח"            // SENT
  | "נפתח"            // OPENED — client opened the signing link
  | "נחתם"            // SIGNED
  | "ממתין לתשלום"   // PAYMENT_PENDING
  | "שולם"            // PAID
  | "פג תוקף"         // EXPIRED
  | "בוטל";           // CANCELED
export type PaymentStatus  = "ממתין לתשלום" | "שולם" | "נכשל" | "בוטל" | null;

export interface Contract {
  // ── Table fields (ContractsList) ──────────────────────
  id:               number | string;
  client:           string;
  contractType:     string;
  property:         string;   // full "street, city" for table display
  dealType:         "שכירות" | "מכירה" | "גם וגם";
  signatureStatus:  SignatureStatus;
  paymentStatus:    PaymentStatus;
  dealClosed:                boolean;
  hideFullAddressFromClient: boolean;
  dealClosedDate:            string | null;
  commission:       string;   // rental commission for BOTH; full commission for SALE/RENTAL
  commissionSale?:  string | null;   // sale commission; only present when dealType = "גם וגם"
  sentDate:         string;
  // ── Detail fields (ContractDetail) ───────────────────
  clientPhone:      string;
  clientEmail:      string;
  clientId:         string;
  propertyAddress:  string;   // street only
  propertyCity:     string;
  propertyPrice:    string;
  createdDate:      string;
  signedDate:       string | null;
  paidDate:         string | null;
  // Raw ISO strings — used for sorting/filtering without re-parsing formatted strings
  createdAtRaw:     string;
  signedAtRaw:      string | null;
  paidAtRaw:        string | null;
  signatureData?:   string | null;
  propertyId?:      string | null;
  paymentUrl?:      string | null;
  generatedText?:   string | null;   // frozen snapshot from ContractTemplate; null = hardcoded fallback
  signatureToken?:  string | null;   // public signing URL token; only used on broker-authenticated pages
  language?:        string | null;   // "HE" | "EN" | "FR" | "RU" | "AR"; default "HE"
  // ── Signing audit (broker detail view only) ────────────────────────────────
  signatureHashPrefix?: string | null;  // first 12 hex chars of SHA-256; safe to display
  hasSignature?:        boolean;        // whether signatureData is present
  signatureIpMasked?:   string | null;  // first octet masked: "*.x.y.z"
}

