import { parsePropertyAddress } from "@/lib/format-address";

// ── Document-body parser ──────────────────────────────────────────────────────
//
// Used by both ContractTemplate (HTML signing page) and ContractPDF to render
// a generatedText string into typed line tokens. Conventions (platform-managed):
//   • First non-empty line  → title
//   • Second non-empty line → subtitle
//   • Lines matching /^\d+\.\s+/ → numbered clause
//   • Everything else       → regular paragraph
//   • Empty lines           → visual spacer

export type DocumentLine =
  | { type: "title";    text: string }
  | { type: "subtitle"; text: string }
  | { type: "para";     text: string }
  | { type: "numbered"; num: string; text: string }
  | { type: "blank" };

export function parseDocumentLines(raw: string): DocumentLine[] {
  const lines  = raw.split("\n");
  const result: DocumentLine[] = [];
  let   header = 0;           // 0 = expecting title, 1 = expecting subtitle, 2 = done

  for (const line of lines) {
    const t = line.trim();

    if (!t) {
      result.push({ type: "blank" });
      continue;
    }

    if (header === 0) { result.push({ type: "title",    text: t }); header = 1; continue; }
    if (header === 1) { result.push({ type: "subtitle", text: t }); header = 2; continue; }

    const m = t.match(/^(\d+)\.\s+([\s\S]+)/);
    if (m) {
      result.push({ type: "numbered", num: m[1], text: m[2] });
    } else {
      result.push({ type: "para", text: t });
    }
  }

  return result;
}

// Split parsed lines at the first numbered clause so callers can insert a
// property table between the preamble (opening paragraphs) and the clauses.
export function splitAtClauses(lines: DocumentLine[]): {
  preamble: DocumentLine[];
  clauses:  DocumentLine[];
} {
  const idx = lines.findIndex((l) => l.type === "numbered");
  if (idx === -1) return { preamble: lines, clauses: [] };
  return { preamble: lines.slice(0, idx), clauses: lines.slice(idx) };
}

// ── TemplateContext ────────────────────────────────────────────────────────────

export interface TemplateContext {
  // Broker
  brokerName:      string;
  brokerLicense:   string;
  brokerPhone:     string;
  brokerIdNumber:  string;
  // Client
  clientName:      string;
  clientIdNumber:  string;
  clientPhone:     string;
  clientEmail:     string;
  clientAddress:   string;   // residential address; "—" until completed on the signing page
  // Property + deal
  propertyAddress: string;
  propertyCity:    string;
  propertyPrice:   string;   // formatted: "₪1,500,000"
  dealType:        string;   // "שכירות" | "מכירה" | "גם וגם"
  commission:      string;   // formatted: "₪15,000" (rental commission for BOTH)
  commissionSale?: string;   // formatted: "₪30,000" — sale commission; set only for BOTH
  // Dynamic rental clause 6.1 — full sentence built from the commission mode
  rentalCommissionClause: string;
  // Dynamic sale clause 5.1 — full sentence built from the sale commission mode
  saleCommissionClause:   string;
  // Exclusivity period (owner-exclusive templates) — DD.MM.YYYY, "—" when absent
  exclusivityStartDate:   string;
  exclusivityEndDate:     string;
  // Dates
  today:           string;   // DD.MM.YYYY
  contractId:      string;   // last 8 chars of id, uppercased
}

// ── Resolver ──────────────────────────────────────────────────────────────────
// Unknown placeholders are left as-is so the lawyer can see what was missed.

export function resolveTemplate(content: string, ctx: TemplateContext): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in ctx ? (ctx as unknown as Record<string, string>)[key] : match,
  );
}

// ── Helpers (self-contained — no circular imports) ────────────────────────────

function formatAgorot(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString("he-IL")}`;
}

function isoToDateStr(iso: string | Date): string {
  const d = new Date(iso as string);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

const DEAL_TYPE_HE: Record<string, string> = { RENTAL: "שכירות", SALE: "מכירה", BOTH: "גם וגם" };

// Hebrew month-count words for the owner-exclusive rental fee clause
// ("דמי שכירות של חודש אחד / שני חודשים / ..."). Keys match the 1-12 range
// enforced on Contract.rentalCommissionMonths.
const HE_MONTH_WORDS: Record<number, string> = {
  1: "חודש אחד",     2: "שני חודשים",    3: "שלושה חודשים",
  4: "ארבעה חודשים", 5: "חמישה חודשים",  6: "שישה חודשים",
  7: "שבעה חודשים",  8: "שמונה חודשים",  9: "תשעה חודשים",
  10: "עשרה חודשים", 11: "אחד עשר חודשים", 12: "שנים עשר חודשים",
};

// ── Context builder ───────────────────────────────────────────────────────────

export function buildContext(opts: {
  broker: {
    fullName:      string;
    licenseNumber: string | null;
    phone:         string | null;
    idNumber:      string | null;
  };
  client: {
    name:     string;
    idNumber: string;
    phone:    string;
    email:    string;
    address?: string | null;   // residential address; optional (completed at signing time)
  };
  contract: {
    id:              string;
    propertyAddress: string;
    propertyCity:    string;
    propertyPrice:   number;    // agorot
    dealType:        string;    // "RENTAL" | "SALE" | "BOTH"
    commission:      number;    // agorot (rental commission for BOTH)
    commissionSale?: number | null;  // agorot; only set for BOTH
    rentalCommissionMode?: "ONE_MONTH" | "FIXED" | "MONTHS" | null;  // drives the rental clause; null -> ONE_MONTH wording
    rentalCommissionMonths?: number | null;               // 1-12; only when mode = MONTHS (owner-exclusive rental)
    saleCommissionMode?:   "PERCENT" | "FIXED" | null;    // drives sale clause 5.1; null -> FIXED wording
    saleCommissionPercent?: number | null;                // human percent (2, 1.5); only for PERCENT
    // Resolved template key — selects template-specific clause wordings
    // (e.g. OWNER_EXCLUSIVE_RENTAL vs the interested-client rental wording).
    templateKey?:    string | null;
    // Exclusivity period (owner-exclusive templates only)
    exclusivityStartsAt?: Date | string | null;
    exclusivityEndsAt?:   Date | string | null;
    createdAt:       Date | string;
  };
}): TemplateContext {
  const isBoth = opts.contract.dealType === "BOTH";

  // Dynamic rental clause — wording differs between the interested-rental
  // template ("בשכירות – …", incl. MONTHS 1-12), the BOTH template
  // ("בעסקת שכירות: …") and the owner-exclusive rental template, matching the
  // lawyer text of each document. Legacy ONE_MONTH / absent modes map to the
  // one-month sentence. The amount always comes from `commission`
  // (for BOTH that IS the rental-side commission).
  const rentalCommissionClause = opts.contract.templateKey === "OWNER_EXCLUSIVE_RENTAL"
    // Owner-exclusive rental wording: MONTHS states the chosen number of monthly
    // rents (1-12, Hebrew words); ONE_MONTH is treated defensively as one month;
    // FIXED (and any absent/incomplete mode) states the stored amount — always
    // truthful and deterministic across regeneration.
    ? (() => {
        const m = opts.contract.rentalCommissionMonths;
        if (opts.contract.rentalCommissionMode === "MONTHS" && m != null && HE_MONTH_WORDS[m]) {
          return `בעסקת שכירות, דמי התיווך יהיו בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[m]}, ללא תלות במשך תקופת השכירות, בתוספת מע"מ כדין.`;
        }
        if (opts.contract.rentalCommissionMode === "ONE_MONTH") {
          return `בעסקת שכירות, דמי התיווך יהיו בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[1]}, ללא תלות במשך תקופת השכירות, בתוספת מע"מ כדין.`;
        }
        return `בעסקת שכירות, דמי התיווך יהיו בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`;
      })()
    : isBoth
    ? (opts.contract.rentalCommissionMode === "FIXED"
        ? `בעסקת שכירות: דמי תיווך בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`
        : `בעסקת שכירות: סכום השווה לדמי שכירות של חודש אחד, בתוספת מע"מ כדין.`)
    : (() => {
        // Interested-rental wording (INTERESTED_BUYER_RENTAL + legacy callers):
        // MONTHS states the chosen number of monthly rents (1-12, Hebrew words);
        // FIXED states the stored amount; legacy ONE_MONTH and absent modes map
        // to the one-month sentence. MONTHS without a valid count falls back to
        // the fixed-amount sentence — always truthful about the stored commission.
        const m = opts.contract.rentalCommissionMonths;
        if (opts.contract.rentalCommissionMode === "MONTHS") {
          if (m != null && HE_MONTH_WORDS[m]) {
            return `בשכירות – דמי תיווך בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[m]}, בתוספת מע"מ כדין.`;
          }
          return `בשכירות – דמי תיווך בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`;
        }
        if (opts.contract.rentalCommissionMode === "FIXED") {
          return `בשכירות – דמי תיווך בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`;
        }
        return `בשכירות – דמי תיווך בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[1]}, בתוספת מע"מ כדין.`;
      })();

  // Dynamic sale clause — PERCENT states the broker's chosen percentage; FIXED
  // (and any absent/incomplete mode) states the stored amount, which is always
  // truthful and deterministic across regeneration.
  // CRITICAL: for BOTH the sale-side amount lives in `commissionSale`
  // (`commission` is the rental side there); for SALE it lives in `commission`.
  const salePct = opts.contract.saleCommissionPercent;
  const saleCommissionClause = opts.contract.templateKey === "OWNER_EXCLUSIVE_SALE"
    // Owner-exclusive sale wording: PERCENT states the broker's chosen percentage
    // of the sale price; FIXED (and any absent/incomplete mode) states the stored
    // amount from `commission` — truthful and deterministic across regeneration.
    ? (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `בעסקת מכר, דמי התיווך יהיו בשיעור של ${String(Number(salePct.toFixed(2)))}% ממחיר המכירה הכולל של הנכס, בתוספת מע"מ כדין.`
        : `בעסקת מכר, דמי התיווך יהיו בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`)
    : isBoth
    ? (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `בעסקת מכר: בשיעור של ${String(Number(salePct.toFixed(2)))}% ממחיר הרכישה הכולל של הנכס, בתוספת מע"מ כדין.`
        : `בעסקת מכר: דמי תיווך בסך של ${formatAgorot(opts.contract.commissionSale ?? opts.contract.commission)}, בתוספת מע"מ כדין.`)
    : (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `ברכישת נכס – סך השווה ל-${String(Number(salePct.toFixed(2)))}% ממחיר העסקה הכולל, בתוספת מע"מ כדין.`
        : `ברכישת נכס – דמי תיווך בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`);

  return {
    brokerName:      opts.broker.fullName,
    brokerLicense:   opts.broker.licenseNumber ?? "—",
    brokerPhone:     opts.broker.phone         ?? "—",
    brokerIdNumber:  opts.broker.idNumber      ?? "—",
    clientName:      opts.client.name,
    clientIdNumber:  opts.client.idNumber      || "—",
    clientPhone:     opts.client.phone,
    clientEmail:     opts.client.email         || "—",
    clientAddress:   opts.client.address?.trim() || "—",
    propertyAddress: parsePropertyAddress(opts.contract.propertyAddress).address,
    propertyCity:    opts.contract.propertyCity,
    propertyPrice:   formatAgorot(opts.contract.propertyPrice),
    dealType:        DEAL_TYPE_HE[opts.contract.dealType] ?? opts.contract.dealType,
    commission:      formatAgorot(opts.contract.commission),
    ...(opts.contract.commissionSale != null
      ? { commissionSale: formatAgorot(opts.contract.commissionSale) }
      : {}),
    // Dynamic clauses — computed above; wording is templateKey/dealType-aware.
    rentalCommissionClause,
    saleCommissionClause,
    // Exclusivity period — deterministic from the persisted dates
    exclusivityStartDate: opts.contract.exclusivityStartsAt ? isoToDateStr(opts.contract.exclusivityStartsAt) : "—",
    exclusivityEndDate:   opts.contract.exclusivityEndsAt   ? isoToDateStr(opts.contract.exclusivityEndsAt)   : "—",
    today:           isoToDateStr(opts.contract.createdAt),
    contractId:      String(opts.contract.id).slice(-8).toUpperCase(),
  };
}
