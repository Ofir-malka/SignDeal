/**
 * StubPaymentProvider — active when PAYMENT_PROVIDER=stub (or unset).
 * Returns a deterministic fake URL; verifyWebhook always resolves to PAID.
 * Safe for local dev and CI; never makes network calls.
 *
 * Payment URL base resolution order (mirrors the Rapyd provider):
 *   1. PAYMENT_REDIRECT_BASE_URL — explicit override (ngrok, staging, etc.)
 *   2. APP_BASE_URL              — generic app base
 *   3. NEXTAUTH_URL              — NextAuth-provided canonical URL
 *   4. http://localhost:3000     — local dev fallback
 */

import type {
  PaymentProvider,
  CreatePaymentLinkParams,
  CreatePaymentLinkResult,
  WebhookPayload,
  WebhookResult,
  MappedStatus,
} from "../provider";

function resolveBase(): string {
  return (
    process.env.PAYMENT_REDIRECT_BASE_URL ??
    process.env.APP_BASE_URL              ??
    process.env.NEXTAUTH_URL              ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export class StubPaymentProvider implements PaymentProvider {
  async createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> {
    const base = resolveBase();
    console.log(
      `[StubPaymentProvider] createPaymentLink paymentId=${params.paymentId} grossAmount=${params.amount} agorot base=${base}`,
    );
    return {
      ok:                true,
      paymentUrl:        `${base}/pay/${params.paymentId}`,
      providerPaymentId: `stub-${params.paymentId}`,
    };
  }

  async verifyWebhook(
    payload: WebhookPayload,
    _headers: Record<string, string>,
  ): Promise<WebhookResult> {
    console.log("[StubPaymentProvider] verifyWebhook", payload);
    return {
      providerPaymentId: String(payload.id ?? "stub-unknown"),
      status:            "PAID",
      paidAt:            new Date(),
    };
  }

  mapWebhookToStatus(_providerStatus: string): MappedStatus {
    return "UNKNOWN";
  }
}
