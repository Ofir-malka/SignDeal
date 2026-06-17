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
 * saveCardToken=1 save the card WITHOUT charging. cField1 is namespaced for the
 * future webhook dispatcher (Phase 1 verifies by polling). NO notifyUrl.
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
    cField1: `saas_token_setup:${args.order}`,
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

/** The cField1 value we send for a token-setup with the given checkout order. */
export function tokenSetupCField1(order: string): string {
  return `saas_token_setup:${order}`;
}
