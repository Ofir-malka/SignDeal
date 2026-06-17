/**
 * /billing/grow/success — Grow Rail A verification/activation BRIDGE (not a destination).
 *
 * The user lands here (still INCOMPLETE) after entering their card on Grow's hosted
 * page. We do NOT trust the redirect: a server-side verifyAndActivateGrowTokenSetup
 * confirms via getPaymentProcessInfo, seals the cardToken, and moves the subscription
 * INCOMPLETE → TRIALING. On immediate success we redirect straight to /dashboard with
 * no intermediate screen; only a pending/slow or failed verification renders UI.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { verifyAndActivateGrowTokenSetup } from "@/lib/billing/providers/grow/activate";
import { GrowActivated } from "./GrowActivated";
import { GrowVerifying } from "./GrowVerifying";

export const dynamic = "force-dynamic";

export default async function GrowBillingSuccessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/billing/grow/success");

  const result = await verifyAndActivateGrowTokenSetup({ userId: session.user.id });

  // Invisible bridge: immediate success → refresh the JWT (so middleware sees
  // TRIALING), then client-replace to /dashboard. A server redirect("/dashboard")
  // here would carry the stale INCOMPLETE JWT and bounce back to /onboarding/billing.
  if (result.state === "trial_started") return <GrowActivated />;
  // Nothing to verify (stale/expired entry) → back to the start.
  if (result.state === "no_checkout") redirect("/onboarding/billing");

  // Pending/slow or failed → render the minimal client bridge UI (polls on pending).
  return <GrowVerifying initialState={result.state === "failed" ? "failed" : "pending"} />;
}
