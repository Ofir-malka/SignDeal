import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "שכחת סיסמה | SignDeal",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
