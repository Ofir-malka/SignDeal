/**
 * Billing plan amounts and labels.
 *
 * A standalone module (no provider imports) so both the checkout provider and the
 * recurring billing engine can import it without creating circular dependencies.
 *
 * Convention: amounts are stored in agorot (100 agorot = ₪1), matching the
 * DB column convention used everywhere in the codebase.
 * Convert to whole shekels (÷ 100) before sending to the provider — all plan prices
 * are exact multiples of 100 agorot so integer division is lossless.
 *
 * AGENCY uses manual / custom billing — the recurring engine never charges it.
 * STARTER and ENTERPRISE are deprecated legacy enum values — never assigned
 * to new rows; excluded here so the engine can't accidentally charge them.
 */

// ── Billable plans ─────────────────────────────────────────────────────────────

export type BillablePlan = "STANDARD" | "GROWTH" | "PRO";

/** Runtime set for cheap `plan IN billablePlans` checks in application code. */
export const BILLABLE_PLANS = new Set<string>(["STANDARD", "GROWTH", "PRO"]);

// ── Plan amounts (agorot) ──────────────────────────────────────────────────────

export const PLAN_AMOUNTS: Record<BillablePlan, { monthly: number; yearly: number }> = {
  STANDARD: { monthly:  3_900, yearly:  34_800 }, // ₪39/mo  · ₪348/yr
  GROWTH:   { monthly:  4_900, yearly:  46_800 }, // ₪49/mo  · ₪468/yr
  PRO:      { monthly: 11_000, yearly: 118_800 }, // ₪110/mo · ₪1,188/yr
};

// ── Plan labels (shown on HYP payment page + recurring charge Info param) ──────
// GROWTH uses the masculine form "מתקדם" — מסלול is masculine in Hebrew.

export const PLAN_LABELS: Record<BillablePlan, string> = {
  STANDARD: "מסלול סטנדרט",
  GROWTH:   "מסלול מתקדם",
  PRO:      "מסלול פרו",
};
