import { redirect } from "next/navigation";
import { TicketView } from "@/components/support/ticket-view";
import { currentUser } from "@/lib/auth/session";

export default async function TicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/support/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TicketView id={id} />
    </div>
  );
}
