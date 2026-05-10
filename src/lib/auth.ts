/**
 * Auth.js v5 full server-side configuration.
 * NOT imported by middleware — use auth.config.ts for the edge-safe shared config.
 *
 * Env vars required:
 *   AUTH_SECRET          — 256-bit random secret (required in all environments)
 *   AUTH_GOOGLE_ID       — Google OAuth client ID  }  both required to
 *   AUTH_GOOGLE_SECRET   — Google OAuth secret     }  enable Google login
 *   AUTH_APPLE_ID        — Apple Sign In client ID }  both required to
 *   AUTH_APPLE_SECRET    — Apple Sign In private key}  enable Apple login
 */

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  adapter: PrismaAdapter(prisma),

  // ── Callbacks (Node.js only — overrides authConfig.callbacks) ────────────────
  //
  // These run for all auth operations in the Node.js runtime:
  //   • Credentials sign-in
  //   • OAuth sign-in (Google, Apple)
  //   • Session access via auth() in server components and API routes
  //
  // The Edge proxy (proxy.ts) uses a separate NextAuth({ ...authConfig }) instance
  // which runs authConfig.callbacks instead — those only read what is already
  // in the token, so no DB access is needed there.
  callbacks: {
    // ── JWT callback ────────────────────────────────────────────────────────────
    // On first sign-in `user` is present — we load the subscription from the DB
    // and write all plan fields into the token so they survive between requests.
    // On subsequent requests `user` is undefined — token is returned as-is.
    async jwt({ token, user, trigger, session: sessionUpdate }) {
      // ── Initial sign-in (user always present for all providers) ──────────────
      if (user?.id) {
        // Core identity fields
        token.id   = user.id;
        token.name =
          (user as { fullName?: string }).fullName ?? token.name ?? null;
        token.profileComplete =
          (user as { profileComplete?: boolean }).profileComplete ?? false;
        token.role =
          (user as { role?: string }).role ?? "BROKER";

        // Load subscription — single query, runs only at sign-in time.
        // Result lives in the JWT for the session lifetime; staleness is
        // acceptable for UI display (API routes always re-check the DB).
        const subscription = await prisma.subscription.findUnique({
          where:  { userId: user.id },
          select: { plan: true, status: true, trialEndsAt: true },
        });

        token.plan               = subscription?.plan   ?? "STARTER";
        token.subscriptionStatus = subscription?.status ?? "EXPIRED";
        // Store as ISO string — JWT values must be JSON-serialisable.
        token.trialEndsAt        =
          subscription?.trialEndsAt?.toISOString() ?? null;
      }

      // ── Session update trigger (e.g. after onboarding completes) ─────────────
      // Allows useSession().update({ profileComplete, name }) to refresh the JWT
      // without a full sign-out/sign-in cycle.
      if (trigger === "update" && sessionUpdate) {
        if (typeof sessionUpdate.profileComplete === "boolean") {
          token.profileComplete = sessionUpdate.profileComplete;
        }
        if (typeof sessionUpdate.name === "string") {
          token.name = sessionUpdate.name;
        }
        // Future: support trigger === "update" + sessionUpdate.refreshSubscription
        // to re-fetch plan from DB when an admin upgrades a user mid-session.
      }

      return token;
    },

    // ── Session callback ────────────────────────────────────────────────────────
    // Maps token → session.user so server components and API routes can read plan
    // data without an extra DB query.
    session({ session, user, token }) {
      if (session.user) {
        // Core identity
        session.user.id =
          user?.id ??
          (token?.id as string | undefined) ??
          (token?.sub as string | undefined) ??
          "";
        session.user.profileComplete =
          (user as { profileComplete?: boolean } | undefined)?.profileComplete ??
          (token?.profileComplete as boolean | undefined) ??
          false;

        // SaaS plan fields — forwarded from token
        session.user.role =
          ((token?.role as string | undefined) ?? "BROKER") as
          "BROKER" | "ADMIN";

        session.user.plan =
          ((token?.plan as string | undefined) ?? "STARTER") as
          "STARTER" | "PRO" | "ENTERPRISE";

        session.user.subscriptionStatus =
          ((token?.subscriptionStatus as string | undefined) ?? "EXPIRED") as
          "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

        session.user.trialEndsAt =
          typeof token?.trialEndsAt === "string"
            ? new Date(token.trialEndsAt)
            : null;
      }
      return session;
    },
  },

  providers: [
    // ── Always included ───────────────────────────────────────────────────────
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Include role so the JWT callback can set token.role without an extra query.
        // Subscription is fetched separately in the jwt callback (consistent for
        // all providers — Credentials and OAuth alike).
        const user = await prisma.user.findUnique({
          where:  { email: String(credentials.email) },
          select: {
            id:              true,
            email:           true,
            fullName:        true,
            passwordHash:    true,
            profileComplete: true,
            role:            true,
            image:           true,
            emailVerified:   true,
          },
        });

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          String(credentials.password),
          user.passwordHash,
        );
        if (!valid) return null;

        return user;
      },
    }),

    // ── Google — only registered when both env vars are present ───────────────
    // Without profile(), the adapter would use Auth.js's default `name` field
    // which doesn't exist in our schema (we use `fullName`), causing a DB error.
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id:            profile.sub,
                email:         profile.email,
                fullName:      profile.name,
                image:         profile.picture ?? null,
                emailVerified: profile.email_verified ? new Date() : null,
              };
            },
          }),
        ]
      : []),

    // ── Apple — only registered when both env vars are present ────────────────
    // Apple's JWT profile never includes `name` (only the initial auth response
    // body does, and only on first sign-in). fullName defaults to "" so the DB
    // not-null constraint is satisfied — user completes their name in /onboarding.
    ...(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET
      ? [
          Apple({
            profile(profile) {
              return {
                id:            profile.sub,
                email:         profile.email,
                fullName:      "",
                image:         null,
                emailVerified:
                  profile.email_verified === true || profile.email_verified === "true"
                    ? new Date()
                    : null,
              };
            },
          }),
        ]
      : []),
  ],
});
