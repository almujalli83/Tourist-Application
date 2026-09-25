import { redirect } from "next/navigation";
import { WalletView } from "@/components/wallet-view";
import { currentUser } from "@/lib/auth/session";

export default async function WalletPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/wallet`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <WalletView />
    </div>
  );
}
