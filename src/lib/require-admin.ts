/**
 * require-admin.ts
 *
 * Admin gate helper for API routes. Mirrors the shape of require-user.ts so
 * callers use the same `instanceof NextResponse` early-return idiom.
 *
 * Critical security property:
 *   The JWT token is NOT trusted for the role check. We always re-query the DB
 *   so that a demoted admin cannot continue calling admin endpoints until their
 *   next sign-in (and so a newly promoted admin can act immediately after the
 *   JWT is re-issued or the admin route forces a DB re-check).
 *
 * Usage:
 *   const result = await requireAdmin();
 *   if (result instanceof NextResponse) return result;
 *   const { adminId } = result;
 */
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { NextResponse }  from "next/server";

export interface AdminContext {
  /** Verified admin's userId — safe to use as actorId in audit events. */
  adminId: string;
}

export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  // ── 1. Session check — must be authenticated ──────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. DB role check — NEVER trust the JWT role for admin actions ─────────
  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { adminId: session.user.id };
}
