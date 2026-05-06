import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Call at the top of any authenticated API route.
 * Returns { userId } on success, or a ready-to-return 401 NextResponse.
 *
 * Usage:
 *   const result = await requireUserId();
 *   if (result instanceof NextResponse) return result;
 *   const { userId } = result;
 */
export async function requireUserId(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}
