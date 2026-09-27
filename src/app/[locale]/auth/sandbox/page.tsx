import { notFound } from "next/navigation";
import { SandboxSignIn } from "@/components/sandbox-signin";
import { providerMode } from "@/lib/auth/social";

export default async function SandboxSignInPage({ searchParams }: { searchParams: Promise<{ provider?: string; state?: string }> }) {
  const { provider, state } = await searchParams;
  if ((provider !== "google" && provider !== "apple") || providerMode(provider) !== "sandbox" || !state) notFound();
  return <SandboxSignIn provider={provider} state={state} />;
}
