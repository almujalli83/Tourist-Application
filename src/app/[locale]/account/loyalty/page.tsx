import { redirect } from "next/navigation";
import { LoyaltyView } from "@/components/loyalty/loyalty-view";
import { currentUser } from "@/lib/auth/session";

export default async function LoyaltyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/loyalty`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LoyaltyView />
    </div>
  );
}
