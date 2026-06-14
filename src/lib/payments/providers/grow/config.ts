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

// ── CreatePaymentLink (Rail B managed long-lived link) — Step 1b ──────────────
// A SEPARATE flow + SEPARATE env from createPaymentProcess. Selected WITHIN the
// Grow rail by GROW_PAYMENT_LINK_ENABLED; the outer rail gate (isGrowPaymentsEnabled
// + shouldUseGrowRail) is unchanged. Do NOT reuse GROW_PAYMENT_PAGECODE here —
// that pageCode belongs to createPaymentProcess hosted checkout.

/** Sub-flag: use CreatePaymentLink instead of createPaymentProcess. Default OFF. */
export function isGrowPaymentLinkEnabled(): boolean {
  return boolEnv("GROW_PAYMENT_LINK_ENABLED");
}

/**
 * CreatePaymentLink host — a DIFFERENT host family than createPaymentProcess
 * (grow.link, not meshulam.co.il). Explicit GROW_PAYMENT_LINK_HOST wins; else
 * derived from GROW_ENVIRONMENT.
 */
export function getGrowPaymentLinkHost(): string {
  return (
    optEnv("GROW_PAYMENT_LINK_HOST") ??
    (growEnvironment() === "production" ? "secure.grow.link" : "sandboxapi.grow.link")
  );
}

export function getCreatePaymentLinkUrl(): string {
  return `https://${getGrowPaymentLinkHost()}/api/light/server/1.0/CreatePaymentLink`;
}

/**
 * CreatePaymentLink product/integration key — the HTTP `x-api-key` HEADER.
 * NOT the broker apiKey (that goes in the BODY) and NOT GROW_PLATFORM_API_KEY
 * (the GetLink/onboarding key — proven to 403 here). Sandbox: the documented
 * product key; production: the per-account production key from Grow.
 */
export function getGrowPaymentLinkXApiKey(): string {
  return reqEnv("GROW_PAYMENT_LINK_X_API_KEY");
}

/** Link-compatible pageCode (sandbox 12796f74fc4f). Separate from GROW_PAYMENT_PAGECODE. */
export function getGrowPaymentLinkPageCode(): string {
  return reqEnv("GROW_PAYMENT_LINK_PAGECODE");
}

/**
 * P3-ready notifyUrl for the CreatePaymentLink server-to-server callback.
 * Per Grow docs the callback is POSTed to the notifyUrl sent IN the request.
 *   Step 1b: returns null (webhook paused) → the field is OMITTED.
 *   P3:      set GROW_PAYMENT_LINK_NOTIFY_URL to EXACTLY
 *            https://www.signdeal.co.il/api/grow/webhook   (flat URL — NO token path).
 */
export function getGrowPaymentLinkNotifyUrl(): string | null {
  return optEnv("GROW_PAYMENT_LINK_NOTIFY_URL");
}

// ── getPaymentLinkInfo (verify-then-trust) + approveTransaction — P3b ──────────
// Both live on the MESHULAM host family (NOT grow.link) and authenticate by the
// broker apiKey in the BODY — there is NO x-api-key header for these.

/** getPaymentLinkInfo URL — authoritative status re-fetch for verify-then-trust. */
export function getGetPaymentLinkInfoUrl(): string {
  return `https://${getGrowPaymentHost()}/api/light/server/1.0/getPaymentLinkInfo`;
}

/** approveTransaction URL — best-effort ACK after PAID. */
export function getApproveTransactionUrl(): string {
  return `https://${getGrowPaymentHost()}/api/light/server/1.0/approveTransaction`;
}

/**
 * Best-effort ApproveTransaction toggle. Default OFF: the exact endpoint/params
 * are not yet probe-confirmed, and Grow processes the payment regardless of the
 * ACK. Flip GROW_PAYMENT_LINK_APPROVE_ENABLED=true once confirmed.
 */
export function isGrowApproveTransactionEnabled(): boolean {
  return boolEnv("GROW_PAYMENT_LINK_APPROVE_ENABLED");
}
