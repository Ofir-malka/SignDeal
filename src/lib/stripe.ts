/**
 * @/lib/stripe — Stripe client singleton and shared Connect utilities.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *   getStripeConfig()         — reads / validates env vars; returns typed config.
 *   getStripeClient()         — returns a lazy singleton Stripe instance.
 *                               Throws clearly if STRIPE_SECRET_KEY is absent.
 *   syncBrokerStripeAccount() — fetches live account state from Stripe and
 *                               writes it back to the BrokerStripeAccount row.
 *                               Called by the status route, webhook handler, and
 *                               the onboarding return page.
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *   STRIPE_SECRET_KEY              required  Server-only key (sk_test_… / sk_live_…).
 *   STRIPE_WEBHOOK_SECRET          required  whsec_… for POST /api/stripe/connect/webhook
 *                                            (account.updated Connect events only).
 *   STRIPE_PAYMENT_WEBHOOK_SECRET  required  whsec_… for POST /api/stripe/payment/webhook
 *                                            (checkout.session.* platform events).
 *                                            Keep separate — different Stripe endpoint,
 *                                            different signing secret.
 *
 * ⚠ This module governs client-to-broker brokerage payments ONLY.
 *   HYP billing (SaaS subscription) is completely separate — see src/lib/billing.
 */

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { StripeOnboardingStatus } from "@/generated/prisma";

// ── Config ────────────────────────────────────────────────────────────────────

export interface StripeConfig {
  secretKey:             string;
  /** whsec_… for POST /api/stripe/connect/webhook (account.updated only) */
  webhookSecret:         string;
  /** whsec_… for POST /api/stripe/payment/webhook (checkout.session.* platform events) */
  paymentWebhookSecret:  string;
  /** true when secretKey is non-empty; false in stub/dev mode */
  isConfigured:          boolean;
}

/**
 * Reads Stripe env vars on every call (no module-level caching of config).
 * Never throws — missing keys are surfaced through `isConfigured: false`.
 * Call getStripeClient() when you actually need to make an API call; that
 * function throws if the key is absent so the route can return a 500.
 */
export function getStripeConfig(): StripeConfig {
  const secretKey            = process.env.STRIPE_SECRET_KEY?.trim()                     ?? "";
  const webhookSecret        = process.env.STRIPE_WEBHOOK_SECRET?.trim()                 ?? "";
  const paymentWebhookSecret = process.env.STRIPE_PAYMENT_WEBHOOK_SECRET?.trim()         ?? "";
  const isConfigured         = Boolean(secretKey);

  if (isConfigured && secretKey.startsWith("sk_live") && process.env.NODE_ENV !== "production") {
    console.warn(
      "[stripe] WARNING: live Stripe secret key detected in a non-production environment. " +
      "Use sk_test_… for local development.",
    );
  }

  return { secretKey, webhookSecret, paymentWebhookSecret, isConfigured };
}

// ── Stripe singleton ──────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

/**
 * Returns the Stripe client singleton. Creates it on first call.
 * Throws with a descriptive message if STRIPE_SECRET_KEY is not set — the
 * calling route should catch this and return a 500 to the client.
 */
export function getStripeClient(): Stripe {
  const { secretKey, isConfigured } = getStripeConfig();

  if (!isConfigured) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. " +
      "Add it to your .env file to enable Stripe Connect.",
    );
  }

  if (!_stripe) {
    _stripe = new Stripe(secretKey, {
      // Locked to the API version shipped with this version of the stripe package.
      // Update intentionally when upgrading the stripe npm package.
      apiVersion: "2026-04-22.dahlia",
    });
  }

  return _stripe;
}

// ── Shared account sync ───────────────────────────────────────────────────────

/**
 * Fetches the latest state of a Connected Account from Stripe and writes it
 * back to the BrokerStripeAccount row in the DB.
 *
 * Called by:
 *   • GET  /api/stripe/connect/status          (broker-triggered poll)
 *   • POST /api/stripe/connect/webhook         (Stripe account.updated event)
 *   • /settings/payments/onboarding/return     (server component — post-redirect)
 *
 * @param stripeAccountId  "acct_..." — the Stripe Connected Account ID.
 * @param lookupField      "userId" or "stripeAccountId" — determines the DB where clause.
 *                         Use "userId" when you already have the session userId (routes).
 *                         Use "stripeAccountId" for webhook (no session, only acct_ known).
 */
export async function syncBrokerStripeAccount(
  stripeAccountId: string,
  lookupField: "stripeAccountId",
): Promise<{ onboardingStatus: StripeOnboardingStatus; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean } | null>;

export async function syncBrokerStripeAccount(
  userId: string,
  lookupField: "userId",
): Promise<{ onboardingStatus: StripeOnboardingStatus; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean } | null>;

export async function syncBrokerStripeAccount(
  id: string,
  lookupField: "userId" | "stripeAccountId",
): Promise<{ onboardingStatus: StripeOnboardingStatus; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean } | null> {
  // Fetch the BrokerStripeAccount row to get the stripeAccountId (when lookupField = "userId")
  const brokerAccount = await prisma.brokerStripeAccount.findUnique({
    where: lookupField === "userId" ? { userId: id } : { stripeAccountId: id },
    select: { stripeAccountId: true },
  });

  if (!brokerAccount) return null;

  // Retrieve live state from Stripe
  const stripe  = getStripeClient();
  const account = await stripe.accounts.retrieve(brokerAccount.stripeAccountId);

  const chargesEnabled   = account.charges_enabled   ?? false;
  const payoutsEnabled   = account.payouts_enabled   ?? false;
  const detailsSubmitted = account.details_submitted ?? false;

  // Derive onboarding status from Stripe's boolean fields + requirements
  let onboardingStatus: StripeOnboardingStatus;
  if (chargesEnabled && payoutsEnabled) {
    onboardingStatus = "COMPLETE";
  } else if (account.requirements?.disabled_reason) {
    onboardingStatus = "RESTRICTED";
  } else if (detailsSubmitted) {
    // Broker submitted info but Stripe hasn't enabled yet (verification in progress)
    onboardingStatus = "IN_PROGRESS";
  } else if ((account.requirements?.currently_due?.length ?? 0) > 0) {
    // Onboarding started but not fully submitted
    onboardingStatus = "IN_PROGRESS";
  } else {
    onboardingStatus = "PENDING";
  }

  // Write back to DB
  await prisma.brokerStripeAccount.update({
    where: { stripeAccountId: brokerAccount.stripeAccountId },
    data:  { chargesEnabled, payoutsEnabled, detailsSubmitted, onboardingStatus },
  });

  return { onboardingStatus, chargesEnabled, payoutsEnabled, detailsSubmitted };
}
