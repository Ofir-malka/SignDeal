"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">בודק התחברות...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    // redirect is in flight via useEffect
    return null;
  }

  return <>{children}</>;
}
