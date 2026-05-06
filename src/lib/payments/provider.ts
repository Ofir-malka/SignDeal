/**
 * Payment provider abstraction.
 * All real provider implementations (Cardcom, Meshulam, PayMe, …)
 * must implement this interface.
 */

// ── Params & results ──────────────────────────────────────────────────────────

export type CreatePaymentLinkParams = {
  contractId:   string;
  paymentId:    string;
  amount:       number;       // grossAmount — total charged to customer, in agorot
  clientName:   string;
  clientPhone:  string;
  clientEmail?: string;
  description:  string;       // shown on the hosted payment page
};

export type CreatePaymentLinkResult =
  | { ok: true;  paymentUrl: string; providerPaymentId: string }
  | { ok: false; reason: string };

// Raw webhook body — each provider sends a different shape.
export type WebhookPayload = Record<string, unknown>;

export type WebhookResult = {
  providerPaymentId: string;
  status:            "PAID" | "FAILED" | "CANCELED";
  paidAt?:           Date;
  totalAmount?:      number;   // agorot — what customer was charged, if provider reports it
  providerFee?:      number;   // agorot — processor cut, if provider reports it
};

export type MappedStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED" | "UNKNOWN";

// ── Interface ─────────────────────────────────────────────────────────────────

export interface PaymentProvider {
  /**
   * Create a hosted payment page and return its URL.
   * Never throws — returns { ok: false, reason } on any error.
   */
  createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult>;

  /**
   * Verify an inbound webhook signature and parse its payload into a
   * normalised result. Never throws — errors surface as { status: "FAILED" }.
   */
  verifyWebhook(
    payload: WebhookPayload,
    headers: Record<string, string>,
  ): Promise<WebhookResult>;

  /**
   * Map a raw provider status string to SignDeal's PaymentStatus enum.
   */
  mapWebhookToStatus(providerStatus: string): MappedStatus;
}
