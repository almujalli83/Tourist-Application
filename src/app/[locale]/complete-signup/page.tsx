import type { Metadata } from "next";
import { CompleteSignup } from "@/components/complete-signup";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default function CompleteSignupPage() {
  return <CompleteSignup />;
}
