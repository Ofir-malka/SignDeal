/**
 * Billing provider abstraction — SaaS subscription billing only.
 *
 * This is intentionally separate from src/lib/payments/ (Rapyd brokerage).
 * Provider selection via BILLING_PROVIDER env var:
 *   stub  — no network calls, deterministic fake URLs (default)
 *   hyp   — HYP (CreditGuard) hosted payment page
 *
 * The public surface is narrow by design. Webhook handling, billing-portal,
 * and subscription-lifecycle endpoints are added incrementally.
 */

import { StubBillingProvider } from "./providers/stub";
import { HypBillingProvider }  from "./providers/hyp";

// ── Shared types ──────────────────────────────────────────────────────────────

export type BillablePlan     = "STANDARD" | "GROWTH" | "PRO";
export type BillingInterval  = "MONTHLY"  | "YEARLY";

export interface CheckoutParams {
  /** Internal user ID (stored in DB — never passed to logs in full). */
  userId:    string;
  /** User's email address — needed for provider customer creation later. */
  userEmail: string;
  plan:      BillablePlan;
  interval:  BillingInterval;
  /** Full URL HYP/stub should redirect to on success. */
  successUrl: string;
  /** Full URL HYP/stub should redirect to on cancel. */
  cancelUrl:  string;
}

export type CheckoutResult =
  | { ok: true;  checkoutUrl: string }
  | { ok: false; reason: string };

// ── Provider interface ────────────────────────────────────────────────────────

export interface BillingProvider {
  /**
   * Create a checkout session and return a URL to redirect the user to.
   * Implementations MUST NOT write to the DB — that is the webhook handler's job.
   */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getBillingProvider(): BillingProvider {
  const name = (process.env.BILLING_PROVIDER ?? "stub").trim().toLowerCase();

  switch (name) {
    case "stub":
      return new StubBillingProvider();

    case "hyp":
      return new HypBillingProvider();

    default:
      console.warn(
        `[billing] Unknown BILLING_PROVIDER="${name}", falling back to stub.`,
      );
      return new StubBillingProvider();
  }
}
