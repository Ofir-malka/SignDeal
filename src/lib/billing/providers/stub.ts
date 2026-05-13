/**
 * StubBillingProvider — development / test stub.
 *
 * • No network calls.
 * • No DB writes.
 * • No card data collected or stored.
 * • Returns a deterministic /billing/stub-checkout URL that renders a
 *   visible TEST MODE page in the browser.
 *
 * Activate with: BILLING_PROVIDER=stub  (the default).
 */

import type { BillingProvider, CheckoutParams, CheckoutResult } from "../index";

export class StubBillingProvider implements BillingProvider {
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    // Log enough to trace the call in dev — no email, truncated userId.
    console.log(
      `[billing/stub] createCheckoutSession` +
      ` userId=${params.userId.slice(0, 8)}…` +
      ` plan=${params.plan}` +
      ` interval=${params.interval}`,
    );

    // Build a stub checkout URL. The page at this path shows a
    // clear TEST MODE banner and a confirm button — no real charge occurs.
    const stubUrl = new URL(
      `/billing/stub-checkout`,
      // Fall back to a relative path if APP_BASE_URL is not set (dev-friendly).
      process.env.APP_BASE_URL ?? "http://localhost:3000",
    );
    stubUrl.searchParams.set("plan",     params.plan);
    stubUrl.searchParams.set("interval", params.interval);

    return { ok: true, checkoutUrl: stubUrl.pathname + stubUrl.search };
  }
}
