import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth-flows";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default function VerifyEmailPage() {
  return <VerifyEmail />;
}
