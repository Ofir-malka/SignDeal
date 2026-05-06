import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe shared auth config.
 * No Prisma, no bcrypt — safe for both middleware (Edge) and server routes (Node.js).
 * Providers and adapter are added in auth.ts only.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },

  callbacks: {
    // Runs on sign-in (user present) and on session access / update (user absent).
    jwt({ token, user, trigger, session: sessionUpdate }) {
      if (user) {
        token.id = user.id;
        // Auth.js maps session.user.name from token.name.
        // Our schema uses fullName, so we map it explicitly.
        token.name =
          (user as { fullName?: string }).fullName ?? token.name ?? null;
        token.profileComplete =
          (user as { profileComplete?: boolean }).profileComplete ?? false;
      }
      // Handle useSession().update({ profileComplete, name }) from the onboarding page.
      // This re-issues the JWT with updated values so middleware sees the new state
      // immediately without requiring the user to sign out and back in.
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

    // Runs when session is read (server components, useSession, API routes).
    session({ session, user, token }) {
      if (session.user) {
        session.user.id =
          user?.id ??
          (token?.id as string | undefined) ??
          (token?.sub as string | undefined) ??
          "";
        session.user.profileComplete =
          (user as { profileComplete?: boolean } | undefined)?.profileComplete ??
          (token?.profileComplete as boolean | undefined) ??
          false;
      }
      return session;
    },
  },

  pages: { signIn: "/login" },

  // No providers here — Credentials (needs bcrypt) and OAuth are added in auth.ts.
  providers: [],
};
