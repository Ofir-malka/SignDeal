import { LoginForm } from "./LoginForm";

// Server component — checks env vars at request time (never exposed to client bundle).
// Both ID and SECRET must be present before a provider button is shown,
// mirroring the conditional provider registration in auth.ts.
export default function LoginPage() {
  const googleEnabled =
    !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  const appleEnabled =
    !!process.env.AUTH_APPLE_ID && !!process.env.AUTH_APPLE_SECRET;

  return <LoginForm googleEnabled={googleEnabled} appleEnabled={appleEnabled} />;
}
