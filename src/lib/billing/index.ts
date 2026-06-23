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
import { GrowBillingProvider } from "./providers/grow/provider";

// ── Shared types ──────────────────────────────────────────────────────────────

// BillablePlan lives in amounts.ts — imported here so CheckoutParams can use it,
// and re-exported for backward compatibility with callers that import from "@/lib/billing".
import type { BillablePlan } from "./amounts";
export type { BillablePlan };
export type BillingInterval  = "MONTHLY"  | "YEARLY";

export interface CheckoutParams {
  /** Internal user ID (stored in DB — never passed to logs in full). */
  userId:    string;
  /** User's email address — needed for provider customer creation later. */
  userEmail: string;
  /** Broker's display name (User.fullName) — used by Grow's pageField[fullName]. */
  userName?:  string;
  /** Broker's phone (User.phone, digits) — used by Grow's pageField[phone]. */
  userPhone?: string | null;
  /** Checkout intent — selects the Grow cField1 namespace (onboarding vs card-update/recovery). */
  purpose?:  "checkout" | "payment_method_update" | "recovery";
  plan:      BillablePlan;
  interval:  BillingInterval;
  /** Full URL HYP/stub should redirect to on success. */
  successUrl: string;
  /** Full URL HYP/stub should redirect to on payment error / failure. */
  errorUrl:   string;
  /** Full URL HYP/stub should redirect to on cancel. */
  cancelUrl:  string;
}

export type CheckoutResult =
  | { ok: true;  checkoutUrl: string; order?: string; growProcessId?: string; growProcessToken?: string }
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

    case "grow":
      return new GrowBillingProvider();

    default:
      console.warn(
        `[billing] Unknown BILLING_PROVIDER="${name}", falling back to stub.`,
      );
      return new StubBillingProvider();
  }
}
