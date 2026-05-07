/**
 * Payment provider factory.
 *
 * Switch providers via PAYMENT_PROVIDER env var:
 *   stub     — development stub, no network calls (default)
 *   rapyd    — Rapyd hosted checkout (sandbox or live via RAPYD_BASE_URL)
 *   cardcom  — future
 *   meshulam — future
 */

import type { PaymentProvider } from "./provider";
import { StubPaymentProvider }  from "./providers/stub";
import { RapydPaymentProvider } from "./providers/rapyd";

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER?.trim() ?? "stub";

  switch (name) {
    case "rapyd":
      return new RapydPaymentProvider();
    case "stub":
      return new StubPaymentProvider();
    // future:
    // case "cardcom":  return new CardcomProvider();
    // case "meshulam": return new MeshulamProvider();
    default:
      console.warn(`[getPaymentProvider] Unknown provider "${name}", falling back to stub`);
      return new StubPaymentProvider();
  }
}

export type {
  PaymentProvider,
  CreatePaymentLinkParams,
  CreatePaymentLinkResult,
  WebhookPayload,
  WebhookResult,
  MappedStatus,
} from "./provider";

export { WebhookSignatureError } from "./providers/rapyd";
