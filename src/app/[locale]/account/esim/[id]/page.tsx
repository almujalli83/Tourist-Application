import { redirect } from "next/navigation";
import { EsimOrderView } from "@/components/esim/esim-order-view";
import { currentUser } from "@/lib/auth/session";

export default async function EsimOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/esim/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <EsimOrderView id={id} />
    </div>
  );
}
