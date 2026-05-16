"use client";

/**
 * DashboardLink
 *
 * Replaces the plain <Link href="/dashboard"> on the billing success page.
 *
 * Problem: after /billing/success activates a subscription (INCOMPLETE → TRIALING),
 * the JWT in the session cookie still carries the OLD subscriptionStatus=INCOMPLETE.
 * Middleware reads only the JWT (no DB hit) and redirects every navigation to
 * /dashboard back to /onboarding/billing until the user logs out and back in.
 *
 * Fix: before navigating, call session.update({ refreshSubscription: true }).
 * This triggers the jwt callback in auth.ts with trigger === "update", which
 * re-fetches the subscription from the DB and writes the new status (TRIALING /
 * ACTIVE) into the JWT cookie — so middleware sees the correct status immediately.
 */

import { useRouter }  from "next/navigation";
import { useSession } from "next-auth/react";

interface Props {
  className?: string;
  children:   React.ReactNode;
}

export function DashboardLink({ className, children }: Props) {
  const router     = useRouter();
  const { update } = useSession();

  async function handleClick() {
    // Refresh subscriptionStatus in the JWT so middleware allows /dashboard.
    // auth.ts jwt callback re-queries the DB when it sees refreshSubscription:true.
    await update({ refreshSubscription: true });
    router.push("/dashboard");
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
