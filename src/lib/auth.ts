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
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

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

        token.plan               = subscription?.plan   ?? "STANDARD";
        token.subscriptionStatus = subscription?.status ?? "EXPIRED";
        // Store as ISO string — JWT values must be JSON-serialisable.
        token.trialEndsAt        =
          subscription?.trialEndsAt?.toISOString() ?? null;

        // ── Session-invalidation guard stamp ──────────────────────────────────
        // Store the user's latest passwordChangedAt as Unix ms in the JWT.
        // The stale-session guard below compares DB value against this on every
        // subsequent auth() call (not the edge middleware — that reads token only).
        // Credentials sign-in: value comes from the authorize() query above.
        // OAuth sign-in:        user object has no passwordChangedAt → 0 is correct
        //                       (OAuth users can't use the reset flow in this app).
        token.passwordChangedAt =
          (user as { passwordChangedAt?: Date | null }).passwordChangedAt
            ?.getTime() ?? 0;
      }

      // ── Stale-session guard (P0 — password-reset session invalidation) ──────
      // On every Node.js auth() call that is NOT the initial sign-in, check
      // whether the user has reset their password after this JWT was issued.
      // If so, return null to invalidate the session — Auth.js will clear the
      // cookie and redirect the user to /login on the next page load.
      //
      // This does NOT fire on the Edge middleware (proxy.ts uses authConfig which
      // has no DB access).  It fires on server-component auth() calls and on
      // every requireUserId() call in API routes — the right places to enforce it.
      //
      // Cost: one indexed primary-key lookup per auth() invocation.  Acceptable
      // for a small SaaS; swap to Redis token versioning if needed at scale.
      if (!user?.id && typeof token.id === "string") {
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.id },
          select: { passwordChangedAt: true },
        });
        const dbPcAt    = dbUser?.passwordChangedAt?.getTime() ?? 0;
        const tokenPcAt = typeof token.passwordChangedAt === "number"
          ? token.passwordChangedAt
          : 0;
        if (dbPcAt > 0 && dbPcAt > tokenPcAt) {
          console.log(
            `[auth/jwt] stale session invalidated after password reset — userId=${token.id}`,
          );
          // Returning null signals Auth.js to treat this as an unauthenticated
          // request; the session cookie will be cleared on the next response.
          return null;
        }
      }

      // ── Session update trigger (e.g. after onboarding completes) ─────────────
      // Allows useSession().update({ … }) to refresh the JWT without a full
      // sign-out/sign-in cycle.
      if (trigger === "update" && sessionUpdate) {
        if (typeof sessionUpdate.profileComplete === "boolean") {
          token.profileComplete = sessionUpdate.profileComplete;
        }
        if (typeof sessionUpdate.name === "string") {
          token.name = sessionUpdate.name;
        }
        // ── Subscription refresh ────────────────────────────────────────────────
        // Called by DashboardLink after /billing/success activates a subscription
        // (INCOMPLETE → TRIALING). Without this, the JWT carries the stale
        // INCOMPLETE status for the rest of the session and middleware redirects
        // the user back to /onboarding/billing on every navigation to /dashboard.
        if (sessionUpdate.refreshSubscription === true && typeof token.id === "string") {
          const sub = await prisma.subscription.findUnique({
            where:  { userId: token.id },
            select: { plan: true, status: true, trialEndsAt: true },
          });
          if (sub) {
            token.plan               = sub.plan;
            token.subscriptionStatus = sub.status;
            token.trialEndsAt        = sub.trialEndsAt?.toISOString() ?? null;
          }
        }
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
          ((token?.plan as string | undefined) ?? "STANDARD") as
          "STANDARD" | "GROWTH" | "PRO" | "AGENCY" | "STARTER" | "ENTERPRISE";

        session.user.subscriptionStatus =
          ((token?.subscriptionStatus as string | undefined) ?? "EXPIRED") as
          "INCOMPLETE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

        session.user.trialEndsAt =
          typeof token?.trialEndsAt === "string"
            ? new Date(token.trialEndsAt)
            : null;
      }
      return session;
    },
  },

  // ── Events ───────────────────────────────────────────────────────────────────
  //
  // `createUser` fires exactly once per new user — only when the Prisma adapter
  // calls its own createUser() during a first-time OAuth sign-in.
  // It does NOT fire for Credentials sign-ins (the adapter is never asked to
  // create a user there; POST /api/users creates the user and subscription
  // atomically before the first sign-in ever happens).
  //
  // This hook therefore covers: Google (now) and Apple (when enabled later).
  //
  // Guard: we check for an existing Subscription before inserting so that
  // this hook is idempotent — safe to re-run even if something retries.
  events: {
    async createUser({ user }) {
      if (!user.id) return; // should never happen, but guard for type safety

      // Idempotency guard — bail out if a subscription already exists.
      // Prevents duplicate rows if Auth.js ever retries or if this hook
      // is somehow invoked for a user created outside the OAuth flow.
      const existing = await prisma.subscription.findUnique({
        where:  { userId: user.id },
        select: { id: true },
      });
      if (existing) return;

      // Phase 2B: start as INCOMPLETE (no card yet).
      // trialEndsAt is NOT set here; it will be set when the user provides a
      // card via /onboarding/billing and the billing success webhook fires.
      const subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan:   "STANDARD",
          status: "INCOMPLETE",
        },
        select: { id: true },
      });

      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          event:          "account_created",
          fromPlan:       null,
          toPlan:         "STANDARD",
          fromStatus:     null,
          toStatus:       "INCOMPLETE",
          source:         "oauth_registration",
          actorId:        null,
          metadata:       JSON.stringify({ note: "card_required_to_start_trial" }),
        },
      });

      // ── Welcome email (non-blocking, after response) ──────────────────────
      // Runs after the OAuth redirect is already underway — any failure here
      // must never surface to the user or roll back the registration.
      // We use after() so the Vercel function stays alive until the send resolves.
      //
      // Apple may return an empty name on first sign-in; fall back to the email
      // local part so the greeting is still personalised.
      if (user.email) {
        after(async () => {
          try {
            // Re-fetch fullName from DB — the Auth.js `user` object carries
            // `name` (Auth.js schema field) not our custom `fullName` column.
            const dbUser = await prisma.user.findUnique({
              where:  { id: user.id! },
              select: { fullName: true, email: true },
            });

            const recipientEmail = dbUser?.email ?? user.email!;
            // Prefer DB fullName → Auth.js name → email local part
            const fullName =
              dbUser?.fullName?.trim() ||
              (user.name?.trim() ?? "") ||
              recipientEmail.split("@")[0];

            const template = welcomeEmail({ fullName });

            // PENDING audit record first — survives a mid-flight crash
            const message = await prisma.message.create({
              data: {
                type:           "USER_WELCOME",
                channel:        "EMAIL",
                provider:       "resend",
                subject:        template.subject,
                body:           template.text,
                userId:         user.id!,
                recipientEmail,
                status:         "PENDING",
                attempts:       0,
              },
            });

            const result = await sendEmail({ to: recipientEmail, ...template });

            await prisma.message.update({
              where: { id: message.id },
              data: result.ok
                ? { status: "SENT",   providerMessageId: result.messageId ?? null, attempts: 1, lastAttemptAt: new Date() }
                : { status: "FAILED", failureReason: result.reason,                attempts: 1, lastAttemptAt: new Date() },
            });

            if (result.ok) {
              console.log(`[auth/createUser] welcome email sent to ${recipientEmail} — id=${result.messageId ?? "n/a"}`);
            } else {
              console.error(`[auth/createUser] welcome email failed for ${recipientEmail}: ${result.reason}`);
            }
          } catch (err) {
            console.error("[auth/createUser] welcome email error:", err instanceof Error ? err.message : err);
          }
        });
      }
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

        // ── Rate limit: 10 sign-in attempts per email per 15 minutes ─────────
        // Prevents credential-stuffing and brute-force attacks.
        // Keyed on email (not IP) to catch distributed attacks from many IPs
        // targeting a single account. Returns null (same as wrong password) so
        // attackers cannot distinguish rate-limiting from failed authentication.
        const email = String(credentials.email).trim().toLowerCase();
        const rl    = await rateLimit(email, "signin", { max: 10, windowMs: 15 * 60_000 });
        if (!rl.allowed) return null;

        // Include role so the JWT callback can set token.role without an extra query.
        // Subscription is fetched separately in the jwt callback (consistent for
        // all providers — Credentials and OAuth alike).
        const user = await prisma.user.findUnique({
          where:  { email: String(credentials.email) },
          select: {
            id:                true,
            email:             true,
            fullName:          true,
            passwordHash:      true,
            profileComplete:   true,
            role:              true,
            image:             true,
            emailVerified:     true,
            passwordChangedAt: true, // needed to stamp into JWT for session-invalidation guard
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
