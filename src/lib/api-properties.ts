import { isoToDateStr, formatAgorot } from "@/lib/api-contracts";

// ─── Hebrew labels ────────────────────────────────────────────────────────────

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "דירה",
  HOUSE:     "בית פרטי",
  OFFICE:    "משרד",
  LAND:      "קרקע",
  PARKING:   "חניה",
  OTHER:     "אחר",
};

export const PROPERTY_LISTING_TYPE_LABELS: Record<string, string> = {
  RENTAL: "להשכרה",
  SALE:   "למכירה",
  BOTH:   "גם וגם",
};

// ─── API response shape ───────────────────────────────────────────────────────

export type ApiPropertyResponse = {
  id:          string;
  userId:      string;
  address:     string;
  city:        string;
  type:        string;           // enum key e.g. "APARTMENT"
  rooms:       number | null;
  floor:       number | null;
  sizeSqm:     number | null;
  askingPrice: number | null;    // agorot
  listingType: string;           // "RENTAL" | "SALE" | "BOTH"
  createdAt:   string;
  updatedAt:   string;
  _count?:     { contracts: number };
};

// ─── Display-ready interface ──────────────────────────────────────────────────

export interface Property {
  id:             string;
  address:        string;
  city:           string;
  typeKey:          string;      // raw enum key — for forms and POST body
  typeLabel:        string;      // Hebrew display label
  listingTypeKey:   string;      // "RENTAL" | "SALE" | "BOTH"
  listingTypeLabel: string;      // "להשכרה" | "למכירה" | "גם וגם"
  rooms:            number | null;
  floor:          number | null;
  sizeSqm:        number | null;
  askingPrice:    string | null; // formatted ₪ string for display
  askingPriceRaw: number | null; // agorot — for pre-filling wizard price field
  contractCount:  number;
  createdDate:    string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function apiToProperty(p: ApiPropertyResponse): Property {
  return {
    id:             p.id,
    address:        p.address,
    city:           p.city,
    typeKey:          p.type,
    typeLabel:        PROPERTY_TYPE_LABELS[p.type] ?? "אחר",
    listingTypeKey:   p.listingType,
    listingTypeLabel: PROPERTY_LISTING_TYPE_LABELS[p.listingType] ?? "להשכרה",
    rooms:            p.rooms,
    floor:          p.floor,
    sizeSqm:        p.sizeSqm,
    askingPrice:    p.askingPrice != null ? formatAgorot(p.askingPrice) : null,
    askingPriceRaw: p.askingPrice ?? null,
    contractCount:  p._count?.contracts ?? 0,
    createdDate:    isoToDateStr(p.createdAt) ?? "—",
  };
}
