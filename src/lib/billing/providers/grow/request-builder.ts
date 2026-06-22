/**
 * src/lib/billing/providers/grow/request-builder.ts — PURE builders.
 * No I/O, no logging, no .reveal(). The apiKey arrives as a plain string (revealed
 * by the *.http.ts caller) and is placed into the form map only.
 */

/** Convert agorot (integer) to Grow's `sum` string in shekels with 2 decimals. */
export function agorotToShekels(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

/**
 * Token-only createPaymentProcess fields (Get Token Only): chargeType=3 +
 * saveCardToken=1 save the card WITHOUT charging. cField1 is namespaced (default
 * "saas_token_setup:<order>"; card-update/recovery pass "saas_card_update:<order>")
 * and verified on return. Verification is by polling getPaymentProcessInfo — NO notifyUrl.
 */
export function buildTokenSetupFields(args: {
  pageCode: string;
  userId: string;
  apiKey: string;
  order: string;
  sumShekels: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  fullName: string;
  email: string;
  phone?: string | null;
  /** Override the cField1 namespace; defaults to `saas_token_setup:<order>` (onboarding). */
  cField1?: string;
}): Record<string, string> {
  const fields: Record<string, string> = {
    pageCode: args.pageCode,
    userId: args.userId,
    apiKey: args.apiKey,
    chargeType: "3",
    saveCardToken: "1",
    sum: args.sumShekels,
    description: args.description,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    "pageField[fullName]": args.fullName,
    "pageField[email]": args.email,
    cField1: args.cField1 ?? `saas_token_setup:${args.order}`,
  };
  if (args.phone && args.phone.trim()) fields["pageField[phone]"] = args.phone.trim();
  return fields;
}

/** getPaymentProcessInfo verify request fields. */
export function buildProcessInfoFields(args: {
  pageCode: string;
  userId: string;
  apiKey: string;
  processId: string;
  processToken: string;
}): Record<string, string> {
  return {
    pageCode: args.pageCode,
    userId: args.userId,
    apiKey: args.apiKey,
    processId: args.processId,
    processToken: args.processToken,
  };
}

/** The cField1 value we send for a token-setup (onboarding) with the given checkout order. */
export function tokenSetupCField1(order: string): string {
  return `saas_token_setup:${order}`;
}

/** The cField1 value we send for a card-update / recovery token setup (distinct namespace). */
export function cardUpdateCField1(order: string): string {
  return `saas_card_update:${order}`;
}

// ── Recurring charge (server → Grow createTransactionWithToken) ────────────────
// SERVER-INITIATED charge of a saved cardToken — NOT a Grow → SignDeal webhook.

/**
 * Deterministic Grow `transactionUniqueIdentifier` from a stable seed (BillingCharge.id).
 * Grow's per-merchant duplicate-charge guard requires a NUMERIC, positive, no-leading-zero,
 * 32-bit-safe value (≤ 2,147,483,647). Deterministic so a replay of the SAME charge row
 * re-sends the SAME identifier (Grow rejects the duplicate); a genuine retry is a NEW row
 * (new id) → a new identifier. Pure (FNV-1a; no Math.random, no Date).
 */
export function growTransactionUid(seed: string): string {
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  // Fold to 31 bits (drop the sign) → [0, 2147483647]; remap 0 → max so it is always positive.
  const n = (h & 0x7fffffff) || 0x7fffffff;
  return String(n);
}

/** The cField1 value we send for a token CHARGE with the given BillingCharge id (correlation only). */
export function tokenChargeCField1(chargeId: string): string {
  return `saas_charge:${chargeId}`;
}

/**
 * createTransactionWithToken fields (server → Grow Rail A recurring charge): charges a saved
 * cardToken with no user interaction. paymentType="2" + paymentNum="1" are required (found via
 * sandbox err 54/1013). `transactionUniqueIdentifier` is Grow's duplicate-charge guard (numeric).
 * apiKey + cardToken arrive as plain strings (revealed by the *.http.ts caller) — never logged here.
 */
export function buildTokenChargeFields(args: {
  pageCode: string;
  userId: string;
  apiKey: string;
  cardToken: string;
  sumShekels: string;
  description: string;
  cField1: string;
  transactionUniqueIdentifier: string;
}): Record<string, string> {
  return {
    pageCode: args.pageCode,
    userId: args.userId,
    apiKey: args.apiKey,
    cardToken: args.cardToken,
    sum: args.sumShekels,
    description: args.description,
    cField1: args.cField1,
    paymentType: "2",
    paymentNum: "1",
    transactionUniqueIdentifier: args.transactionUniqueIdentifier,
  };
}
