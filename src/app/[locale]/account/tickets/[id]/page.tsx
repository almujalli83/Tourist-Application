import { redirect } from "next/navigation";
import { TicketView } from "@/components/events/ticket-view";
import { currentUser } from "@/lib/auth/session";

export default async function TicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/tickets/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TicketView id={id} />
    </div>
  );
}
