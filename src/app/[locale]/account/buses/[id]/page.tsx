import { redirect } from "next/navigation";
import { BusTicketView } from "@/components/buses/bus-ticket-view";
import { currentUser } from "@/lib/auth/session";

export default async function BusTicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/buses/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <BusTicketView id={id} />
    </div>
  );
}
