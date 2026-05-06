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
  dealType:         "שכירות" | "מכירה";
  signatureStatus:  SignatureStatus;
  paymentStatus:    PaymentStatus;
  dealClosed:                boolean;
  hideFullAddressFromClient: boolean;
  dealClosedDate:            string | null;
  commission:       string;
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
  signatureData?:   string | null;
  propertyId?:      string | null;
  paymentUrl?:      string | null;
  generatedText?:   string | null;   // frozen snapshot from ContractTemplate; null = hardcoded fallback
  signatureToken?:  string | null;   // public signing URL token; only used on broker-authenticated pages
  language?:        string | null;   // "HE" | "EN" | "FR" | "RU" | "AR"; default "HE"
}

