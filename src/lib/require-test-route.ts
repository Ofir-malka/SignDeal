/**
 * Gate for developer-only SMS test routes.
 *
 * Three sequential guards — the first failure short-circuits:
 *
 *   1. Production gate
 *      Returns 404 when NODE_ENV=production and ENABLE_TEST_SMS_ROUTES≠"true".
 *      On Vercel, NODE_ENV is always "production", so you MUST set
 *      ENABLE_TEST_SMS_ROUTES=true in Vercel project env vars for any
 *      environment where you need these routes (e.g. staging / sandbox).
 *      Never set this in your live-production Vercel environment.
 *
 *   2. Session authentication
 *      Returns 401 when no valid session exists.
 *
 *   3. Admin email allowlist
 *      Returns 403 when the authenticated user's email is not in
 *      INTERNAL_ADMIN_EMAILS (comma-separated list).
 *      When INTERNAL_ADMIN_EMAILS is empty or unset, ALL access is denied
 *      (fail-secure default).
 *
 * Usage in a route handler:
 *   const gate = await requireTestRouteAccess();
 *   if (!gate.ok) return gate.response;
 *   const { userId, email } = gate;
 */

import { auth }         from "@/lib/auth";
import { NextResponse } from "next/server";

export type TestRouteGateOk = {
  ok:     true;
  userId: string;
  email:  string;
};

export type TestRouteGateBlocked = {
  ok:       false;
  response: NextResponse;
};

export type TestRouteGate = TestRouteGateOk | TestRouteGateBlocked;

function blocked(body: Record<string, string>, status: number): TestRouteGateBlocked {
  return { ok: false, response: NextResponse.json(body, { status }) };
}

export async function requireTestRouteAccess(): Promise<TestRouteGate> {
  // ── Guard 1: production gate ───────────────────────────────────────────────
  const isProduction      = process.env.NODE_ENV === "production";
  const explicitlyEnabled = process.env.ENABLE_TEST_SMS_ROUTES === "true";

  if (isProduction && !explicitlyEnabled) {
    // Return 404 not 403 — the route should appear non-existent to attackers.
    return blocked({ error: "Not found" }, 404);
  }

  // ── Guard 2: session authentication ───────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return blocked({ error: "Unauthorized" }, 401);
  }

  // ── Guard 3: admin email allowlist ─────────────────────────────────────────
  // Fail-secure: if the env var is unset or empty, deny all access so these
  // routes are never accidentally open.
  const raw       = process.env.INTERNAL_ADMIN_EMAILS ?? "";
  const allowlist = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    console.warn(
      "[requireTestRouteAccess] INTERNAL_ADMIN_EMAILS is not configured — " +
      "denying all access to test routes. Set this env var to enable access.",
    );
    return blocked(
      { error: "Forbidden — INTERNAL_ADMIN_EMAILS not configured" },
      403,
    );
  }

  const userEmail = session.user.email.toLowerCase();
  if (!allowlist.includes(userEmail)) {
    console.warn(
      `[requireTestRouteAccess] access denied — ${userEmail} is not in INTERNAL_ADMIN_EMAILS`,
    );
    return blocked({ error: "Forbidden" }, 403);
  }

  console.log(
    `[requireTestRouteAccess] ✓ access granted — ${userEmail}` +
    (isProduction ? " [production, ENABLE_TEST_SMS_ROUTES=true]" : " [development]"),
  );

  return { ok: true, userId: session.user.id, email: session.user.email };
}
