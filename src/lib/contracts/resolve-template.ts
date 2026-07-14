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
  // Primary service-order sibling (OWNER_EXCLUSIVE_GENERAL only) — "—" when absent
  serviceOrderNumber:     string;   // sibling doc number, chrome format (last 8 chars, uppercased)
  serviceOrderDate:       string;   // sibling creation date, DD.MM.YYYY
  // Counterparty broker license (broker-cooperation documents) — inline suffix
  // for the מתווך ב׳ party line: ", רישיון תיווך מס׳ X" or "" when absent
  counterpartyBrokerLicenseSuffix: string;
  // Buyer-to-seller transfer terms (BROKER_COOP_BUYER_TO_SELLER only) — human
  // percent string ("0.5", "1", "1.5", "2") and integer days string; "" when
  // absent (never "—": the document must not render "—%" or "— ימים")
  brokerCoopTransferPercent: string;
  brokerCoopTransferDueDays: string;
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

// Hebrew month-count words for the months-based rental fee clause
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
    rentalCommissionMonths?: number | null;               // 1-12; only when mode = MONTHS
    saleCommissionMode?:   "PERCENT" | "FIXED" | null;    // drives sale clause 5.1; null -> FIXED wording
    saleCommissionPercent?: number | null;                // human percent (2, 1.5); only for PERCENT
    // Resolved template key — selects template-specific clause wordings
    // (e.g. the owner service-order keys vs the interested-client wordings).
    templateKey?:    string | null;
    // Exclusivity period (owner-exclusive templates only)
    exclusivityStartsAt?: Date | string | null;
    exclusivityEndsAt?:   Date | string | null;
    // Primary service-order sibling (loaded via Contract.relatedContractId) —
    // fills {{serviceOrderNumber}} / {{serviceOrderDate}} on the general
    // exclusivity document (OWNER_EXCLUSIVE_GENERAL).
    serviceOrder?: { id: string; createdAt: Date | string } | null;
    // Counterparty (cooperating) broker license — all broker-cooperation
    // subtypes; optional, from Contract.counterpartyBrokerLicenseNumber.
    // The suffix is key-agnostic.
    counterpartyBrokerLicenseNumber?: string | null;
    // Buyer-to-seller transfer terms (BROKER_COOP_BUYER_TO_SELLER) — required
    // by route validation for that key; from Contract.brokerCoopTransferPercent
    // / Contract.brokerCoopTransferDueDays. Null for every other key.
    brokerCoopTransferPercent?: number | null;
    brokerCoopTransferDueDays?: number | null;
    createdAt:       Date | string;
  };
}): TemplateContext {
  const isBoth = opts.contract.dealType === "BOTH";

  // Dynamic rental clause — wording differs between the owner service-order
  // documents ("בעסקת שכירות, דמי התיווך יהיו…") and the interested wording
  // ("בשכירות – …"), shared by INTERESTED_BUYER_RENTAL and the rental half of
  // INTERESTED_BUYER_BOTH. Both families support MONTHS (1-12, Hebrew words);
  // legacy ONE_MONTH maps to the one-month sentence. The amount always comes
  // from `commission` (for BOTH that IS the rental-side commission).
  const isOwnerServiceRental = opts.contract.templateKey === "OWNER_SERVICE_ORDER_RENTAL";
  const rentalCommissionClause = (isOwnerServiceRental || opts.contract.templateKey === "OWNER_SERVICE_ORDER_BOTH")
    // Owner service-order wording (clause 6; clause 7 in the BOTH document):
    // MONTHS states the chosen number of monthly rents; ONE_MONTH is accepted
    // only as legacy API compatibility; FIXED states the stored amount.
    // Absent/incomplete data (unreachable past route validation — the mode and
    // the MONTHS count are REQUIRED for these keys) falls back to the
    // fixed-amount sentence, never silently to one month. The standalone rental
    // document carries "ללא תלות במשך תקופת השכירות"; the BOTH document's
    // rental clause omits it (per the lawyer sources).
    ? (() => {
        const tail = isOwnerServiceRental ? ", ללא תלות במשך תקופת השכירות" : "";
        const m = opts.contract.rentalCommissionMonths;
        if (opts.contract.rentalCommissionMode === "MONTHS" && m != null && HE_MONTH_WORDS[m]) {
          return `בעסקת שכירות, דמי התיווך יהיו בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[m]}${tail}, בתוספת מע"מ כדין.`;
        }
        if (opts.contract.rentalCommissionMode === "ONE_MONTH") {
          return `בעסקת שכירות, דמי התיווך יהיו בסכום השווה לדמי שכירות של ${HE_MONTH_WORDS[1]}${tail}, בתוספת מע"מ כדין.`;
        }
        return `בעסקת שכירות, דמי התיווך יהיו בסך של ${formatAgorot(opts.contract.commission)}, בתוספת מע"מ כדין.`;
      })()
    : (() => {
        // Interested wording (INTERESTED_BUYER_RENTAL, the rental half of
        // INTERESTED_BUYER_BOTH, + legacy callers):
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
  const saleCommissionClause = (opts.contract.templateKey === "OWNER_SERVICE_ORDER_SALE" || opts.contract.templateKey === "OWNER_SERVICE_ORDER_BOTH")
    // Owner service-order sale wording (clause 6): PERCENT states the chosen
    // percentage of the deal value; FIXED (and any absent/incomplete mode)
    // states the stored amount — from `commission` for the standalone SALE
    // document and from `commissionSale` for the BOTH document (where
    // `commission` is the rental side). Truthful + deterministic either way.
    ? (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `בעסקת מכירה, דמי התיווך יהיו בסכום השווה ל-${String(Number(salePct.toFixed(2)))}% משווי העסקה, בתוספת מע"מ כדין.`
        : `בעסקת מכירה, דמי התיווך יהיו בסך של ${formatAgorot(
            opts.contract.templateKey === "OWNER_SERVICE_ORDER_BOTH"
              ? (opts.contract.commissionSale ?? opts.contract.commission)
              : opts.contract.commission,
          )}, בתוספת מע"מ כדין.`)
    : isBoth
    // BOTH sale wording ("בקנייה – …") — the approved platform variant of the
    // BOTH lawyer document (source typos corrected); the amount comes from
    // `commissionSale` (the sale side; `commission` is the rental side there).
    ? (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `בקנייה – דמי תיווך בשיעור של ${String(Number(salePct.toFixed(2)))}% ממחיר העסקה הכולל, בתוספת מע"מ כדין.`
        : `בקנייה – דמי תיווך בסך של ${formatAgorot(opts.contract.commissionSale ?? opts.contract.commission)}, בתוספת מע"מ כדין.`)
    // Interested-sale wording — the approved platform variant of the lawyer
    // document ("דמי תיווך בשיעור של X%"; the source says "סך השווה ל-X%").
    : (opts.contract.saleCommissionMode === "PERCENT" && salePct != null
        ? `ברכישת נכס – דמי תיווך בשיעור של ${String(Number(salePct.toFixed(2)))}% ממחיר העסקה הכולל, בתוספת מע"מ כדין.`
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
    // Primary service-order sibling reference — identical formatting to the
    // chrome doc number (contractId) and platform dates, so the exclusivity
    // document's citation always matches what the sibling displays.
    serviceOrderNumber: opts.contract.serviceOrder ? String(opts.contract.serviceOrder.id).slice(-8).toUpperCase() : "—",
    serviceOrderDate:   opts.contract.serviceOrder ? isoToDateStr(opts.contract.serviceOrder.createdAt) : "—",
    // Counterparty broker license (broker-cooperation documents) — inline
    // suffix appended to the מתווך ב׳ party line; empty when absent, so the
    // document never renders a dangling "רישיון תיווך מס׳ —".
    counterpartyBrokerLicenseSuffix: opts.contract.counterpartyBrokerLicenseNumber?.trim()
      ? `, רישיון תיווך מס׳ ${opts.contract.counterpartyBrokerLicenseNumber.trim()}`
      : "",
    // Buyer-to-seller transfer terms — the percent reuses the
    // saleCommissionPercent formatting convention (toFixed(2) then Number
    // strips trailing zeros: 0.5→"0.5", 1→"1", 1.5→"1.5", 2→"2"). Route
    // validation requires both for BROKER_COOP_BUYER_TO_SELLER, so null only
    // occurs for templates that never reference these placeholders — rendered
    // as empty strings, never "—" (the document must not show "—%"/"— ימים").
    brokerCoopTransferPercent: opts.contract.brokerCoopTransferPercent != null
      ? String(Number(opts.contract.brokerCoopTransferPercent.toFixed(2)))
      : "",
    brokerCoopTransferDueDays: opts.contract.brokerCoopTransferDueDays != null
      ? String(opts.contract.brokerCoopTransferDueDays)
      : "",
    today:           isoToDateStr(opts.contract.createdAt),
    contractId:      String(opts.contract.id).slice(-8).toUpperCase(),
  };
}
