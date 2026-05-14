import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "איפוס סיסמה | SignDeal",
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  // Pass token to client form — it validates presence here, server-side
  // validation happens in the API route on submit.
  return <ResetPasswordForm token={token ?? ""} />;
}
