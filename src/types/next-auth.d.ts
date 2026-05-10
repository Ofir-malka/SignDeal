import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

// ── String-literal union types for plan/role/status ───────────────────────────
// We use string literals (not Prisma enum imports) so this declaration file
// stays edge-safe — no Prisma runtime dependency is introduced here.

type UserRole           = "BROKER" | "ADMIN";
type PlanType           = "STARTER" | "PRO" | "ENTERPRISE";
type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      profileComplete: boolean;
      // ── SaaS plan fields ────────────────────────────────────────────────────
      // Set at sign-in from the DB; forwarded via JWT.
      // Use for UI display only. For permission enforcement, always re-check DB.
      role:               UserRole;
      plan:               PlanType;
      subscriptionStatus: SubscriptionStatus;
      trialEndsAt:        Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    fullName?:       string | null;
    profileComplete?: boolean;
    role?:           UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?:                 string;
    profileComplete?:    boolean;
    // ── SaaS plan fields (stored as primitives; trialEndsAt as ISO string) ───
    role?:               string;
    plan?:               string;
    subscriptionStatus?: string;
    trialEndsAt?:        string | null;
  }
}
