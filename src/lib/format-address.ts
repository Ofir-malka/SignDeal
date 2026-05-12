/**
 * parsePropertyAddress
 *
 * Decodes the structured address string stored in Contract.propertyAddress.
 *
 * Format (written by buildPropertyAddress in NewContractForm):
 *   "<street> <number>||<floor>||<apartment>"
 *
 * Examples:
 *   "רוטשילד 15||4||8"  →  { address: "רוטשילד 15", floor: "4", apartment: "8" }
 *   "רוטשילד 15"        →  { address: "רוטשילד 15", floor: "",  apartment: ""  }  (legacy / no floor-apt)
 *   "רוטשילד 15||3||"   →  { address: "רוטשילד 15", floor: "3", apartment: ""  }
 */
export function parsePropertyAddress(raw: string): {
  address:   string;
  floor:     string;
  apartment: string;
} {
  const parts     = (raw ?? "").split("||");
  const address   = (parts[0] ?? "").trim();
  const floor     = (parts[1] ?? "").trim();
  const apartment = (parts[2] ?? "").trim();
  return { address, floor, apartment };
}

/**
 * formatPropertyAddress
 *
 * Formats a property address for display, optionally hiding the house/building
 * number for client-facing views before the contract is signed.
 *
 * ── Rules ─────────────────────────────────────────────────────────────────────
 *
 *   revealFullAddress = true  (broker view, or after client signs):
 *     "הירקון 55, תל אביב"
 *
 *   revealFullAddress = false (pre-signature, hideFullAddressFromClient enabled):
 *     Street name is kept; house/building number and any apartment suffix are
 *     stripped.  City is always shown.
 *     "הירקון, תל אביב"
 *
 * ── Stripping logic ───────────────────────────────────────────────────────────
 *
 *   Israeli addresses follow "<street name> <number>" order.
 *   The regex /\s+\d+.*$/ matches the first whitespace+digit sequence to end:
 *
 *   "הירקון 55"          →  "הירקון"        (plain number)
 *   "דיזנגוף 99"         →  "דיזנגוף"      (plain number)
 *   "ביאליק 12/3"         →  "ביאליק"       (slash apartment)
 *   "הרצל 15א"            →  "הרצל"         (letter suffix)
 *   "הרצל"                →  "הרצל"         (no number — unchanged)
 *
 * ── Edge cases ────────────────────────────────────────────────────────────────
 *
 *   address=""  city="תל אביב"  → "תל אביב" (both modes)
 *   address="X" city=""         → "X"        (both modes)
 *   address=""  city=""         → ""         (both modes)
 *   address is only a number    → falls back to original address (not silenced)
 *
 * Note: accepts both legacy plain strings and new "street||floor||apt" format.
 */
export function formatPropertyAddress(
  rawAddress: string,
  city:       string,
  revealFullAddress: boolean,
): string {
  // Decode structured format (new records) — legacy records have no "||" so
  // parsePropertyAddress returns the full string as `address` unchanged.
  const { address: addr } = parsePropertyAddress(rawAddress);
  const cty = city?.trim() ?? "";

  if (revealFullAddress) {
    // Full display: "street number, city"
    if (addr && cty) return `${addr}, ${cty}`;
    return addr || cty;
  }

  // Partial display: strip house number (and any following apartment info)
  const stripped   = addr.replace(/\s+\d+.*$/, "").trim();
  // If stripping removed everything (e.g. address was just "55"), fall back to
  // the original so the client sees something meaningful rather than blank.
  const streetOnly = stripped || addr;

  if (streetOnly && cty) return `${streetOnly}, ${cty}`;
  return streetOnly || cty;
}
