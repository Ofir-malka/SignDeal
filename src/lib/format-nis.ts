/**
 * Format a NIS amount string with thousands commas as the user types.
 * Strips existing commas, formats pure-integer strings, passes partial/non-numeric input through.
 *   "10000"   → "10,000"
 *   "1500000" → "1,500,000"
 *   ""        → ""
 *   "1."      → "1."   (partial — not disrupted)
 *   "abc"     → "abc"  (invalid — let validation catch it)
 */
export function formatNisInput(raw: string): string {
  const stripped = raw.replace(/,/g, "");
  if (stripped === "" || !/^\d+$/.test(stripped)) return stripped;
  return parseInt(stripped, 10).toLocaleString("he-IL");
}
