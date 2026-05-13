import type { Metadata } from "next";
import { auth }          from "@/lib/auth";
import { prisma }        from "@/lib/prisma";
import { SigningPage }   from "@/components/SigningPage";

// Public page (no auth required) — but private per-recipient, so must not be indexed.
export const metadata: Metadata = {
  title:  "חתימה על חוזה",
  robots: { index: false, follow: false },
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // ── Owner preview check ───────────────────────────────────────────────────
  // If the authenticated session user is the contract owner, render the signing
  // page in read-only preview mode.  Regular clients are unauthenticated (no
  // session cookie) so auth() returns null for them — zero overhead on the
  // common path.
  let previewMode = false;

  const session = await auth();
  if (session?.user?.id) {
    const contract = await prisma.contract.findUnique({
      where:  { signatureToken: token },
      select: { userId: true },
    });
    // Exact userId match → the broker who owns this contract is viewing it.
    previewMode = contract?.userId === session.user.id;
  }

  return <SigningPage token={token} previewMode={previewMode} />;
}
