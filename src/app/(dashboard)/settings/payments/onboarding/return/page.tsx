/**
 * /settings/payments/onboarding/return
 *
 * Stripe's return_url — the page Stripe redirects the broker to after they
 * complete (or attempt to complete) the Express onboarding flow.
 *
 * This page is server-rendered. It:
 *   1. Authenticates the broker via the session cookie (Stripe doesn't send
 *      any auth — the cookie from the original browser session is present).
 *   2. Syncs the latest account state from Stripe to the DB.
 *   3. Redirects to /settings/payments to show the authoritative status.
 *
 * Note: Stripe's return_url is reached on "completion", but "complete" in
 * Stripe's terms means "the user finished the onboarding form", NOT that
 * chargesEnabled is already true. Verification can take seconds or hours.
 * The sync + redirect pattern ensures /settings/payments always reads the DB,
 * which will be updated again by the account.updated webhook once Stripe
 * finishes verification.
 */

import { redirect }  from "next/navigation";
import { auth }      from "@/lib/auth";
import { syncBrokerStripeAccount, getStripeClient } from "@/lib/stripe";

export default async function OnboardingReturnPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/settings/payments");
  }
  const userId = session.user.id;

  // Attempt to sync — non-fatal if Stripe is not yet configured or the
  // account doesn't exist (e.g. user navigated here directly).
  try {
    getStripeClient(); // will throw if STRIPE_SECRET_KEY is absent
    await syncBrokerStripeAccount(userId, "userId");
  } catch (err) {
    // Log but do not block the redirect — /settings/payments will show the
    // current DB state, and the webhook will sync when Stripe fires.
    console.error(
      `[settings/payments/onboarding/return] sync failed userId=${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  redirect("/settings/payments");
}
