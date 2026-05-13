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
  // Property + deal
  propertyAddress: string;
  propertyCity:    string;
  propertyPrice:   string;   // formatted: "₪1,500,000"
  dealType:        string;   // "שכירות" | "מכירה"
  commission:      string;   // formatted: "₪15,000"
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
  };
  contract: {
    id:              string;
    propertyAddress: string;
    propertyCity:    string;
    propertyPrice:   number;   // agorot
    dealType:        string;   // "RENTAL" | "SALE"
    commission:      number;   // agorot
    createdAt:       Date | string;
  };
}): TemplateContext {
  return {
    brokerName:      opts.broker.fullName,
    brokerLicense:   opts.broker.licenseNumber ?? "—",
    brokerPhone:     opts.broker.phone         ?? "—",
    brokerIdNumber:  opts.broker.idNumber      ?? "—",
    clientName:      opts.client.name,
    clientIdNumber:  opts.client.idNumber      || "—",
    clientPhone:     opts.client.phone,
    clientEmail:     opts.client.email         || "—",
    propertyAddress: parsePropertyAddress(opts.contract.propertyAddress).address,
    propertyCity:    opts.contract.propertyCity,
    propertyPrice:   formatAgorot(opts.contract.propertyPrice),
    dealType:        DEAL_TYPE_HE[opts.contract.dealType] ?? opts.contract.dealType,
    commission:      formatAgorot(opts.contract.commission),
    today:           isoToDateStr(opts.contract.createdAt),
    contractId:      String(opts.contract.id).slice(-8).toUpperCase(),
  };
}
