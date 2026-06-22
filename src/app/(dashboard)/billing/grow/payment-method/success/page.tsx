/**
 * /billing/grow/payment-method/success — Grow Rail A CARD-UPDATE / RECOVERY bridge.
 *
 * Existing users land here after entering a new card on Grow's hosted page (from
 * /settings/billing/payment-method or /recover). We do NOT trust the redirect: a
 * server-side verifyAndApplyGrowCardUpdate confirms via getPaymentProcessInfo, claim-gates
 * the checkout, rotates the sealed cardToken, and (recovery) clears failures + re-arms.
 * On success we refresh the JWT then client-replace to /settings/billing.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { verifyAndApplyGrowCardUpdate } from "@/lib/billing/providers/grow/card-update";
import { GrowPaymentMethodActivated } from "./GrowPaymentMethodActivated";
import { GrowPaymentMethodVerifying } from "./GrowPaymentMethodVerifying";

export const dynamic = "force-dynamic";

export default async function GrowPaymentMethodSuccessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/billing/grow/payment-method/success");

  const result = await verifyAndApplyGrowCardUpdate({ userId: session.user.id });

  // Refresh the JWT then client-replace to /settings/billing. Recovery flips PAST_DUE→ACTIVE,
  // so the cookie status would be stale; card-update leaves status unchanged (refresh harmless).
  if (result.state === "applied") return <GrowPaymentMethodActivated />;
  if (result.state === "no_checkout") redirect("/settings/billing");

  return <GrowPaymentMethodVerifying initialState={result.state === "failed" ? "failed" : "pending"} />;
}
