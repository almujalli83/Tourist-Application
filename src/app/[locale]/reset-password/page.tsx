import type { Metadata } from "next";
import { ResetPassword } from "@/components/auth-flows";

// The link carries a secret: keep it out of other sites' logs.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default function ResetPasswordPage() {
  return <ResetPassword />;
}
