import { redirect } from "next/navigation";
import { TransferView } from "@/components/transfers/transfer-view";
import { currentUser } from "@/lib/auth/session";

export default async function TransferPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/transfers/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TransferView id={id} />
    </div>
  );
}
