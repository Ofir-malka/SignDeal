import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe shared auth config.
 * No Prisma, no bcrypt — safe for both middleware (Edge) and server routes (Node.js).
 * Providers and adapter are added in auth.ts only.
 *
 * JWT strategy notes:
 *   • On sign-in the jwt() callback receives `user`.  auth.ts overrides this
 *     callback to load subscription data from the DB at that point.
 *   • This config's jwt() runs in the Edge proxy where DB access is not available.
 *     It reads fields that are ALREADY in the token (written by auth.ts at sign-in)
 *     and forwards them on subsequent requests.
 *   • The session() callback here runs in BOTH the Edge proxy and the Node.js
 *     server — it maps whatever is in the token to session.user.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  callbacks: {
    // ── JWT callback ──────────────────────────────────────────────────────────
    // Runs on sign-in (user present) and on every session access / update (user absent).
    // auth.ts OVERRIDES this entire callback for Node.js auth operations so it can
    // hit the DB.  This version only forwards existing token fields — safe for Edge.
    jwt({ token, user, trigger, session: sessionUpdate }) {
      if (user) {
        token.id = user.id;
        // Auth.js maps session.user.name from token.name.
        // Our schema uses fullName, so map it explicitly.
        token.name =
          (user as { fullName?: string }).fullName ?? token.name ?? null;
        token.profileComplete =
          (user as { profileComplete?: boolean }).profileComplete ?? false;

        // Role is a scalar on User — safe to read without a DB call.
        // plan/subscriptionStatus/trialEndsAt are loaded from DB in auth.ts's
        // jwt override and written into the token there.  On subsequent Edge
        // requests the values are already present in the token so no fetch needed.
        token.role =
          (user as { role?: string }).role ?? token.role ?? "BROKER";
      }

      // Handle useSession().update({ profileComplete, name }) from onboarding.
      // Re-issues the JWT with updated values so middleware sees the new state
      // without requiring sign-out/sign-in.
      if (trigger === "update" && sessionUpdate) {
        if (typeof sessionUpdate.profileComplete === "boolean") {
          token.profileComplete = sessionUpdate.profileComplete;
        }
        if (typeof sessionUpdate.name === "string") {
          token.name = sessionUpdate.name;
        }
      }

      return token;
    },

    // ── Session callback ──────────────────────────────────────────────────────
    // Runs when the session is read (server components, useSession, API routes,
    // and the Edge proxy).  Maps token → session.user.
    session({ session, user, token }) {
      if (session.user) {
        // ── Existing fields ──────────────────────────────────────────────────
        session.user.id =
          user?.id ??
          (token?.id as string | undefined) ??
          (token?.sub as string | undefined) ??
          "";
        session.user.profileComplete =
          (user as { profileComplete?: boolean } | undefined)?.profileComplete ??
          (token?.profileComplete as boolean | undefined) ??
          false;

        // ── New SaaS plan fields ─────────────────────────────────────────────
        // Values are written into the token by auth.ts at sign-in time.
        // On subsequent requests (including Edge proxy) they are already in the
        // token and just forwarded here.  Safe defaults ensure no null crashes.
        session.user.role =
          ((token?.role as string | undefined) ?? "BROKER") as
          "BROKER" | "ADMIN";

        session.user.plan =
          ((token?.plan as string | undefined) ?? "STARTER") as
          "STARTER" | "PRO" | "ENTERPRISE";

        session.user.subscriptionStatus =
          ((token?.subscriptionStatus as string | undefined) ?? "EXPIRED") as
          "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

        // trialEndsAt is stored as an ISO string in the JWT (JSON-serialisable).
        // Convert back to Date for callers.
        session.user.trialEndsAt =
          typeof token?.trialEndsAt === "string"
            ? new Date(token.trialEndsAt)
            : null;
      }
      return session;
    },
  },

  pages: { signIn: "/login" },

  // No providers here — Credentials (needs bcrypt) and OAuth are added in auth.ts.
  providers: [],
};
