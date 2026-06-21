/**
 * src/lib/billing/providers/grow/config.ts — RAIL A (Broker → SignDeal SaaS).
 *
 * Server-only env resolution, read at CALL time. SEPARATE from Rail B's Grow config
 * (src/lib/payments/providers/grow/config.ts) — different rail, different env vars,
 * SignDeal's OWN merchant (not a broker). The apiKey is NOT an env var here: it is
 * the GROW_SAAS_MERCHANT_API_KEY Platform secret, read via the Rail A secret facade.
 */

function boolEnv(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}
function reqEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not configured (server env)`);
  return v;
}
function optEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v === "" ? null : v;
}

/** Master switch for Rail A Grow SaaS billing. Default OFF. */
export function isGrowSaasEnabled(): boolean {
  return boolEnv("GROW_SAAS_ENABLED");
}

/**
 * Master gate for Rail A Grow RECURRING charging (server → Grow createTransactionWithToken).
 * SEPARATE from isGrowSaasEnabled() (checkout / token-setup). Default OFF — the recurring
 * engine skips the Grow scan entirely unless this is "true". Server-initiated charges only.
 */
export function isGrowSaasRecurringEnabled(): boolean {
  return boolEnv("ENABLE_GROW_RECURRING_CHARGES");
}

function growSaasEnvironment(): "sandbox" | "production" {
  const v = (process.env.GROW_SAAS_ENVIRONMENT ?? "sandbox").trim().toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

/** Meshulam host for SignDeal's SaaS merchant. Explicit GROW_SAAS_HOST wins. */
export function getGrowSaasHost(): string {
  return (
    optEnv("GROW_SAAS_HOST") ??
    (growSaasEnvironment() === "production" ? "secure.meshulam.co.il" : "sandbox.meshulam.co.il")
  );
}

export function getGrowSaasCreatePaymentProcessUrl(): string {
  return `https://${getGrowSaasHost()}/api/light/server/1.0/createPaymentProcess`;
}
export function getGrowSaasGetPaymentProcessInfoUrl(): string {
  return `https://${getGrowSaasHost()}/api/light/server/1.0/getPaymentProcessInfo`;
}
/** Endpoint for the SERVER-INITIATED recurring charge of a saved cardToken (Rail A). */
export function getGrowSaasCreateTransactionWithTokenUrl(): string {
  return `https://${getGrowSaasHost()}/api/light/server/1.0/createTransactionWithToken`;
}

/** SignDeal's OWN Grow merchant userId (money routes to SignDeal). */
export function getGrowSaasUserId(): string {
  return reqEnv("GROW_SAAS_USER_ID");
}
/** SignDeal's token-enabled pageCode. */
export function getGrowSaasPageCode(): string {
  return reqEnv("GROW_SAAS_PAGECODE");
}
