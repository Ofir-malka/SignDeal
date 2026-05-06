/**
 * StubPaymentProvider — active when PAYMENT_PROVIDER=stub (or unset).
 * Returns a deterministic fake URL; verifyWebhook always resolves to PAID.
 * Safe for local dev and CI; never makes network calls.
 */

import type {
  PaymentProvider,
  CreatePaymentLinkParams,
  CreatePaymentLinkResult,
  WebhookPayload,
  WebhookResult,
  MappedStatus,
} from "../provider";

export class StubPaymentProvider implements PaymentProvider {
  async createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> {
    console.log(
      `[StubPaymentProvider] createPaymentLink paymentId=${params.paymentId} grossAmount=${params.amount} agorot`,
    );
    return {
      ok:                true,
      paymentUrl:        `https://pay.signdeal.app/pay/${params.paymentId}`,
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
