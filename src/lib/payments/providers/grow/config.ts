/**
 * src/lib/payments/providers/grow/config.ts — RAIL B (Client → Broker) Grow payment config.
 *
 * Server-only env resolution, read at CALL time (never import time) so a build or
 * a flag-off deployment never throws. Separate from the ONBOARDING config in
 * src/lib/grow/config.ts (different rail concern, different env vars).
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

/** Master switch for Rail B Grow payments. Default OFF. */
export function isGrowPaymentsEnabled(): boolean {
  return boolEnv("GROW_PAYMENTS_ENABLED");
}

/**
 * Pure routing predicate (unit-tested): a payment may be routed to Grow ONLY when
 * the flag is on AND the broker's GrowBrokerMerchant is active. A PENDING_VERIFICATION
 * (isActive=false) or missing merchant must NEVER route to Grow.
 */
export function shouldUseGrowRail(enabled: boolean, isActive: boolean | null | undefined): boolean {
  return enabled === true && isActive === true;
}

function growEnvironment(): "sandbox" | "production" {
  const v = (process.env.GROW_ENVIRONMENT ?? "sandbox").trim().toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

/** Payment API host. Explicit GROW_PAYMENT_HOST wins; else derived from GROW_ENVIRONMENT. */
export function getGrowPaymentHost(): string {
  return (
    optEnv("GROW_PAYMENT_HOST") ??
    (growEnvironment() === "production" ? "secure.meshulam.co.il" : "sandbox.meshulam.co.il")
  );
}

export function getCreatePaymentProcessUrl(): string {
  return `https://${getGrowPaymentHost()}/api/light/server/1.0/createPaymentProcess`;
}

/** Platform-level pageCode for Rail B client→broker payment pages (sandbox: 12796f74fc4f). */
export function getGrowPaymentPageCode(): string {
  return reqEnv("GROW_PAYMENT_PAGECODE");
}

/** Optional fixed ILS (ex-VAT) platform commission. Null → omit the field entirely. */
export function getGrowCompanyCommission(): string | null {
  return optEnv("GROW_COMPANY_COMMISSION");
}

/**
 * Grow-confirmation pending: whether to send transactionUniqueIdentifier on
 * createPaymentProcess. Default OFF — the field is undocumented for this endpoint
 * (token-txn only). Flip on ONLY once Grow confirms createPaymentProcess honors it.
 */
export function shouldSendTransactionUniqueIdentifier(): boolean {
  return boolEnv("GROW_PAYMENT_SEND_UNIQUE_ID");
}

function appBaseUrl(): string {
  return (optEnv("APP_BASE_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}
export function buildSuccessUrl(contractId: string): string {
  return `${appBaseUrl()}/pay/complete?contractId=${encodeURIComponent(contractId)}&provider=grow`;
}
export function buildCancelUrl(contractId: string): string {
  return `${appBaseUrl()}/pay/complete?contractId=${encodeURIComponent(contractId)}&status=cancel`;
}

/** Step 1: notifyUrl intentionally omitted (no /api/grow/webhook handler yet — Step 2). */
export function getPaymentNotifyUrl(): string | null {
  return null;
}
