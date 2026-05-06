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
 *   "רחוב הרצל 15"       →  "רחוב הרצל"    (prefixed street)
 *   "דיזנגוף 99, דירה 4" →  "דיזנגוף"      (number + apartment)
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
 */
export function formatPropertyAddress(
  address: string,
  city:    string,
  revealFullAddress: boolean,
): string {
  const addr = address?.trim() ?? "";
  const cty  = city?.trim()    ?? "";

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
