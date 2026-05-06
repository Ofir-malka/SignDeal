import { SigningPage } from "@/components/SigningPage";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SigningPage token={token} />;
}
