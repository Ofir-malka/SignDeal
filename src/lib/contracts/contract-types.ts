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
