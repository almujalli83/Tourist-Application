import { redirect } from "next/navigation";
import { TransitTicketView } from "@/components/transit/ticket-view";
import { currentUser } from "@/lib/auth/session";

export default async function TransitTicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/transit/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TransitTicketView id={id} />
    </div>
  );
}
