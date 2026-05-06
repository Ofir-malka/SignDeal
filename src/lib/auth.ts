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

  providers: [
    // ── Always included ───────────────────────────────────────────────────────
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email) },
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
