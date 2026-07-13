// ── Canonical contract category strings ───────────────────────────────────────
//
// The exact `contractType` value sent in POST /api/contracts, stored on
// Contract.contractType, and matched by the API's template-resolution maps
// (CONTRACT_TYPE_TO_TEMPLATE_KEY / TEMPLATE_KEY_BY_TYPE_AND_DEAL in
// src/app/api/contracts/route.ts).
//
// Byte-exact matching is load-bearing: the form payload, the dashboard cards,
// and the route maps must agree character-for-character or template resolution
// silently yields generatedText = null. Never inline these strings — always
// import from here.
//
// This is intentionally a plain constants module (importable from both client
// components and server routes) — template resolution logic stays in the route.

export const CONTRACT_TYPE = {
  INTERESTED:      "החתמת מתעניין",
  OWNER_EXCLUSIVE: "החתמת בעל נכס / בלעדיות",
  BROKER_COOP:     "הסכם שיתוף פעולה בין מתווכים",
  TRANSFER:        "העברת לקוח בין מתווכים",   // UI-only for now; no template key yet
} as const;

export type ContractTypeValue = (typeof CONTRACT_TYPE)[keyof typeof CONTRACT_TYPE];

// ── Fee-chrome suppression ─────────────────────────────────────────────────────
//
// Template keys whose documents must not display fee amounts anywhere in the
// platform chrome: property-table commission rows, the commission-terms
// section, the detail-page fee row, and the PDF equivalents. Both exclusivity
// documents carry no fee terms of their own: the GENERAL one delegates them to
// its service-order sibling (clause 12 cites it by number/date), and the
// standalone ONLY variant creates no owner fee obligation at all — showing an
// amount would contradict either document.
//
// Both broker-cooperation subtypes are likewise fee-free chrome-wise: the
// shared-pool agreement divides one pooled fee equally after actual collection,
// and the each-side agreement has each broker collect its own fee from its own
// client — neither states a specific commission amount, so the UI must show
// "—", never ₪0.
//
// Key-gated by design — NEVER inferred from commission === 0 (a legitimate
// fee document may carry a zero fee). Returns false for every other key and
// for legacy/unknown/null keys, so existing documents render unchanged.
export function hidesFeeChrome(templateKey?: string | null): boolean {
  return (
    templateKey === "OWNER_EXCLUSIVE_GENERAL"
    || templateKey === "OWNER_EXCLUSIVE_ONLY"
    || templateKey === "BROKER_COOP_SHARED_POOL"
    || templateKey === "BROKER_COOP_EACH_SIDE"
  );
}
