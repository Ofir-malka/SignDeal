import type { Metadata } from "next";
import { SigningPage } from "@/components/SigningPage";

// Public page (no auth required) — but private per-recipient, so must not be indexed.
export const metadata: Metadata = {
  title:  "חתימה על חוזה",
  robots: { index: false, follow: false },
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SigningPage token={token} />;
}
